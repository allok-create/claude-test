import { getDb, tx } from "../db";
import { AppError, assert } from "../utils/errors";
import { allowanceFormatFor, isDeductible } from "../vat-codes";
import { audit } from "./audit";
import { getCompanyInfo, getMappedAccountId, getSetting } from "./settings";
import { createVoucher, voidVoucher, type VoucherLineInput } from "./vouchers";
import { vatPeriodLabel, vatPeriodOf, vatPeriodRange } from "./vat-lock";

/**
 * 營業稅申報：
 * 1. 依「營業人進、銷項資料檔」格式產生媒體申報檔（每筆 81 字元）
 * 2. 計算 401 申報書各欄（銷項、進項、應納或溢付稅額、留抵與退稅）
 * 3. 確認申報後產生營業稅結轉傳票，並鎖定該期發票與折讓單
 *
 * 金額於本模組內部仍以「分」計算，寫入媒體檔時轉為元。
 */

export { vatPeriodLabel, vatPeriodOf, vatPeriodRange };

export type VatRecordSource = "ar_invoice" | "ar_allowance" | "ap_bill" | "ap_allowance";

export type VatRecord = {
  formatCode: string;
  date: string;
  buyerId: string; // 買受人統一編號（銷項作廢、二聯式為空白）
  sellerId: string; // 銷售人統一編號
  docNo: string; // 發票字軌號碼／其他憑證號碼（10 碼）或海關繳納證號碼（14 碼）
  amount: number; // 分
  taxType: string; // 1／2／3／F
  tax: number; // 分
  deductionCode: string; // 進項 1–4，銷項空白
  customsMark: string; // 零稅率通關方式註記
  source: VatRecordSource;
  sourceId: number;
  sourceNo: string;
  partnerName: string;
};

export type VatProblem = { source: VatRecordSource; sourceId: number; sourceNo: string; partnerName: string; message: string };

const pad0 = (v: number | string, len: number) => String(v).padStart(len, "0").slice(-len);
const padR = (v: string, len: number) => v.padEnd(len, " ").slice(0, len);
const yuan = (cents: number) => Math.round(cents / 100);

/**
 * 組成一筆 81 字元之進、銷項資料：
 *  1-2 格式代號｜3-11 稅籍編號｜12-18 流水號｜19-21 年度（民國）｜22-23 月份
 *  24-31 買受人統編｜32-39 銷售人統編｜40-49 發票字軌號碼／其他憑證號碼（海關繳納證為 36-49）
 *  50-61 銷售額／稅基｜62 課稅別｜63-72 營業稅額｜73 扣抵代號｜74-78 空白
 *  79 特種稅額稅率｜80 彙加註記｜81 通關方式註記
 */
export function formatRecord(r: VatRecord, taxRegNo: string, serial: number): string {
  const rocYear = Number(r.date.slice(0, 4)) - 1911;
  const month = r.date.slice(5, 7);
  const middle =
    r.formatCode === "28"
      ? padR(r.buyerId, 8) + " ".repeat(4) + padR(r.docNo, 14)
      : padR(r.buyerId, 8) + padR(r.sellerId, 8) + padR(r.docNo, 10);
  const line =
    r.formatCode +
    pad0(taxRegNo, 9) +
    pad0(serial, 7) +
    pad0(rocYear, 3) +
    month +
    middle +
    pad0(yuan(r.amount), 12) +
    r.taxType +
    pad0(yuan(r.tax), 10) +
    padR(r.deductionCode, 1) +
    " ".repeat(5) +
    " " + // 特種稅額稅率：一般稅額計算之營業人空白
    " " + // 彙加註記：本系統逐筆申報
    padR(r.customsMark, 1);
  if (line.length !== 81) throw new Error(`媒體申報資料長度錯誤（${line.length}）`);
  return line;
}

/** 收集期間內之進、銷項憑證資料 */
export function collectVatRecords(period: string): { records: VatRecord[]; problems: VatProblem[] } {
  const { from, to } = vatPeriodRange(period);
  const db = getDb();
  const company = getCompanyInfo();
  const ourId = company.taxId;
  const records: VatRecord[] = [];
  const problems: VatProblem[] = [];

  // 銷項：發票（含作廢）
  const invoices = db
    .prepare(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.gui_no, i.invoice_format, i.tax_type, i.customs_mark, i.subtotal, i.tax_amount, i.status,
         c.name customer_name, c.tax_id customer_tax_id
       FROM ar_invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.invoice_date BETWEEN ? AND ? ORDER BY i.invoice_date, i.id`,
    )
    .all(from, to) as {
    id: number;
    invoice_no: string;
    invoice_date: string;
    gui_no: string | null;
    invoice_format: string;
    tax_type: string;
    customs_mark: string | null;
    subtotal: number;
    tax_amount: number;
    status: string;
    customer_name: string;
    customer_tax_id: string | null;
  }[];
  for (const i of invoices) {
    const base = { source: "ar_invoice" as const, sourceId: i.id, sourceNo: i.invoice_no, partnerName: i.customer_name };
    if (!i.gui_no) {
      if (i.status !== "void") problems.push({ ...base, message: "未填統一發票號碼" });
      continue;
    }
    const voided = i.status === "void";
    records.push({
      ...base,
      formatCode: i.invoice_format,
      date: i.invoice_date,
      buyerId: voided || i.invoice_format === "32" ? "" : i.customer_tax_id ?? "",
      sellerId: ourId,
      docNo: i.gui_no,
      amount: voided ? 0 : i.subtotal,
      taxType: voided ? "F" : i.tax_type,
      tax: voided ? 0 : i.tax_amount,
      deductionCode: "",
      customsMark: voided ? "" : i.customs_mark ?? "",
    });
  }

  // 銷項：銷貨退回或折讓證明單
  const arAllow = db
    .prepare(
      `SELECT a.id, a.allowance_no, a.allowance_date, a.amount, a.tax_amount, i.gui_no, i.invoice_format, i.tax_type, i.customs_mark,
         c.name customer_name, c.tax_id customer_tax_id
       FROM ar_allowances a JOIN ar_invoices i ON i.id = a.invoice_id JOIN customers c ON c.id = i.customer_id
       WHERE a.status = 'active' AND a.allowance_date BETWEEN ? AND ? ORDER BY a.allowance_date, a.id`,
    )
    .all(from, to) as {
    id: number;
    allowance_no: string;
    allowance_date: string;
    amount: number;
    tax_amount: number;
    gui_no: string | null;
    invoice_format: string;
    tax_type: string;
    customs_mark: string | null;
    customer_name: string;
    customer_tax_id: string | null;
  }[];
  for (const a of arAllow) {
    const base = { source: "ar_allowance" as const, sourceId: a.id, sourceNo: a.allowance_no, partnerName: a.customer_name };
    const code = allowanceFormatFor(a.invoice_format);
    if (!a.gui_no || !code) {
      problems.push({ ...base, message: "原發票未填統一發票號碼，無法申報折讓" });
      continue;
    }
    records.push({
      ...base,
      formatCode: code,
      date: a.allowance_date,
      buyerId: code === "34" ? "" : a.customer_tax_id ?? "",
      sellerId: ourId,
      docNo: a.gui_no,
      amount: a.amount,
      taxType: a.tax_type,
      tax: a.tax_amount,
      deductionCode: "",
      customsMark: a.customs_mark ?? "",
    });
  }

  // 進項：憑證
  const bills = db
    .prepare(
      `SELECT b.id, b.bill_no, b.bill_date, b.vendor_ref, b.invoice_format, b.tax_type, b.deduction_code, b.subtotal, b.tax_amount,
         v.name vendor_name, v.tax_id vendor_tax_id
       FROM ap_bills b JOIN vendors v ON v.id = b.vendor_id
       WHERE b.status != 'void' AND b.invoice_format != 'none' AND b.bill_date BETWEEN ? AND ? ORDER BY b.bill_date, b.id`,
    )
    .all(from, to) as {
    id: number;
    bill_no: string;
    bill_date: string;
    vendor_ref: string | null;
    invoice_format: string;
    tax_type: string;
    deduction_code: string;
    subtotal: number;
    tax_amount: number;
    vendor_name: string;
    vendor_tax_id: string | null;
  }[];
  for (const b of bills) {
    const base = { source: "ap_bill" as const, sourceId: b.id, sourceNo: b.bill_no, partnerName: b.vendor_name };
    if (!b.vendor_ref) {
      problems.push({ ...base, message: b.invoice_format === "28" ? "未填海關代徵營業稅繳納證號碼" : "未填進項憑證號碼" });
      continue;
    }
    if (b.invoice_format !== "28" && !b.vendor_tax_id) {
      problems.push({ ...base, message: "供應商未填統一編號" });
      continue;
    }
    records.push({
      ...base,
      formatCode: b.invoice_format,
      date: b.bill_date,
      buyerId: ourId,
      sellerId: b.invoice_format === "28" ? "" : b.vendor_tax_id ?? "",
      docNo: b.vendor_ref,
      amount: b.subtotal,
      taxType: b.tax_type,
      tax: b.tax_amount,
      deductionCode: b.deduction_code,
      customsMark: "",
    });
  }

  // 進項：進貨退出或折讓證明單
  const apAllow = db
    .prepare(
      `SELECT a.id, a.allowance_no, a.allowance_date, a.amount, a.tax_amount, b.vendor_ref, b.invoice_format, b.tax_type, b.deduction_code,
         v.name vendor_name, v.tax_id vendor_tax_id
       FROM ap_allowances a JOIN ap_bills b ON b.id = a.bill_id JOIN vendors v ON v.id = b.vendor_id
       WHERE a.status = 'active' AND b.invoice_format != 'none' AND a.allowance_date BETWEEN ? AND ? ORDER BY a.allowance_date, a.id`,
    )
    .all(from, to) as {
    id: number;
    allowance_no: string;
    allowance_date: string;
    amount: number;
    tax_amount: number;
    vendor_ref: string | null;
    invoice_format: string;
    tax_type: string;
    deduction_code: string;
    vendor_name: string;
    vendor_tax_id: string | null;
  }[];
  for (const a of apAllow) {
    const base = { source: "ap_allowance" as const, sourceId: a.id, sourceNo: a.allowance_no, partnerName: a.vendor_name };
    const code = allowanceFormatFor(a.invoice_format);
    if (!code || !a.vendor_ref || !a.vendor_tax_id) {
      problems.push({ ...base, message: "原進項憑證號碼或供應商統一編號未填，無法申報折讓" });
      continue;
    }
    records.push({
      ...base,
      formatCode: code,
      date: a.allowance_date,
      buyerId: ourId,
      sellerId: a.vendor_tax_id,
      docNo: a.vendor_ref,
      amount: a.amount,
      taxType: a.tax_type,
      tax: a.tax_amount,
      deductionCode: a.deduction_code,
      customsMark: "",
    });
  }

  records.sort((x, y) => x.formatCode.localeCompare(y.formatCode) || x.date.localeCompare(y.date) || x.docNo.localeCompare(y.docNo));
  return { records, problems };
}

type Pair = { amount: number; tax: number };
const zero = (): Pair => ({ amount: 0, tax: 0 });

export type Vat401 = {
  period: string;
  label: string;
  sales: {
    rows: { code: string; label: string; taxable: Pair; zeroRated: number; exempt: number }[];
    allowance: { taxable: Pair; zeroRated: number; exempt: number };
    total: { taxable: Pair; zeroRated: number; exempt: number };
    zeroRatedCustoms: number; // 經海關出口
    zeroRatedNonCustoms: number; // 非經海關出口
  };
  purchases: {
    rows: { code: string; label: string; expense: Pair; fixedAsset: Pair }[];
    allowance: { expense: Pair; fixedAsset: Pair };
    total: { expense: Pair; fixedAsset: Pair };
    nonDeductible: Pair; // 不得扣抵（扣抵代號 3、4）
  };
  outputTax: number;
  inputTax: number;
  carryIn: number;
  carryInSource: string;
  payable: number; // 本期應實繳稅額
  excess: number; // 本期溢付稅額
  refundLimit: number; // 退稅限額
  refund: number; // 本期應退稅額
  carryOut: number; // 本期累積留抵稅額
  warnings: string[];
};

const SALES_ROWS = [
  { code: "31", label: "三聯式發票、電子計算機發票" },
  { code: "35", label: "收銀機發票（三聯式）及電子發票" },
  { code: "32", label: "二聯式發票、收銀機發票（二聯式）" },
];
const PURCHASE_ROWS = [
  { code: "21", label: "統一發票扣抵聯（三聯式、電子計算機）" },
  { code: "25", label: "三聯式收銀機發票扣抵聯及一般稅額計算之電子發票" },
  { code: "22", label: "載有稅額之其他憑證（含二聯式收銀機發票）" },
  { code: "28", label: "海關代徵營業稅繳納證扣抵聯" },
];

function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-11` : `${y}-${String(m - 2).padStart(2, "0")}`;
}

export type VatFiling = {
  period: string;
  carry_in: number;
  output_tax: number;
  input_tax: number;
  payable: number;
  refund: number;
  carry_out: number;
  data: string;
  voucher_id: number | null;
  filed_by: number | null;
  filed_at: string;
};

export function getFiling(period: string): VatFiling | undefined {
  return getDb().prepare("SELECT * FROM vat_filings WHERE period = ?").get(period) as VatFiling | undefined;
}

export function listFilings(): (VatFiling & { voucher_no: string | null; filed_by_name: string | null })[] {
  return getDb()
    .prepare(
      `SELECT f.*, v.voucher_no, u.display_name filed_by_name FROM vat_filings f
       LEFT JOIN vouchers v ON v.id = f.voucher_id LEFT JOIN users u ON u.id = f.filed_by
       ORDER BY f.period DESC`,
    )
    .all() as (VatFiling & { voucher_no: string | null; filed_by_name: string | null })[];
}

/** 上期累積留抵稅額：取前一期申報結果；系統首期使用「期初留抵稅額」設定 */
function resolveCarryIn(period: string): { amount: number; source: string; warning?: string } {
  const prev = previousPeriod(period);
  const prevFiling = getFiling(prev);
  if (prevFiling) return { amount: prevFiling.carry_out, source: `${vatPeriodLabel(prev)}申報之累積留抵稅額` };
  const earlier = getDb().prepare("SELECT period FROM vat_filings WHERE period < ? ORDER BY period DESC LIMIT 1").get(period) as { period: string } | undefined;
  if (earlier) {
    return { amount: 0, source: "—", warning: `${vatPeriodLabel(prev)}尚未於本系統完成申報，無法取得上期累積留抵稅額` };
  }
  const opening = Number(getSetting("tax.opening_credit", "0")) || 0;
  return { amount: opening, source: "系統設定之期初累積留抵稅額" };
}

/** 計算 401 申報書 */
export function computeVat401(period: string, records = collectVatRecords(period).records): Vat401 {
  const sales = {
    rows: SALES_ROWS.map((r) => ({ ...r, taxable: zero(), zeroRated: 0, exempt: 0 })),
    allowance: { taxable: zero(), zeroRated: 0, exempt: 0 },
    total: { taxable: zero(), zeroRated: 0, exempt: 0 },
    zeroRatedCustoms: 0,
    zeroRatedNonCustoms: 0,
  };
  const purchases = {
    rows: PURCHASE_ROWS.map((r) => ({ ...r, expense: zero(), fixedAsset: zero() })),
    allowance: { expense: zero(), fixedAsset: zero() },
    total: { expense: zero(), fixedAsset: zero() },
    nonDeductible: zero(),
  };

  for (const r of records) {
    if (r.taxType === "F") continue;
    const isAllowance = ["33", "34", "23", "24"].includes(r.formatCode);
    if (r.source === "ar_invoice" || r.source === "ar_allowance") {
      const target = isAllowance ? sales.allowance : sales.rows.find((x) => x.code === r.formatCode);
      if (!target) continue;
      if (r.taxType === "1") {
        target.taxable.amount += r.amount;
        target.taxable.tax += r.tax;
      } else if (r.taxType === "2") {
        target.zeroRated += r.amount;
        const sign = isAllowance ? -1 : 1;
        if (r.customsMark === "2") sales.zeroRatedCustoms += sign * r.amount;
        else sales.zeroRatedNonCustoms += sign * r.amount;
      } else target.exempt += r.amount;
    } else {
      if (!isDeductible(r.deductionCode)) {
        const sign = isAllowance ? -1 : 1;
        purchases.nonDeductible.amount += sign * r.amount;
        purchases.nonDeductible.tax += sign * r.tax;
        continue;
      }
      const target = isAllowance ? purchases.allowance : purchases.rows.find((x) => x.code === r.formatCode);
      if (!target) continue;
      const bucket = r.deductionCode === "2" ? target.fixedAsset : target.expense;
      bucket.amount += r.amount;
      bucket.tax += r.tax;
    }
  }

  for (const row of sales.rows) {
    sales.total.taxable.amount += row.taxable.amount;
    sales.total.taxable.tax += row.taxable.tax;
    sales.total.zeroRated += row.zeroRated;
    sales.total.exempt += row.exempt;
  }
  sales.total.taxable.amount -= sales.allowance.taxable.amount;
  sales.total.taxable.tax -= sales.allowance.taxable.tax;
  sales.total.zeroRated -= sales.allowance.zeroRated;
  sales.total.exempt -= sales.allowance.exempt;

  for (const row of purchases.rows) {
    for (const k of ["expense", "fixedAsset"] as const) {
      purchases.total[k].amount += row[k].amount;
      purchases.total[k].tax += row[k].tax;
    }
  }
  for (const k of ["expense", "fixedAsset"] as const) {
    purchases.total[k].amount -= purchases.allowance[k].amount;
    purchases.total[k].tax -= purchases.allowance[k].tax;
  }

  const warnings: string[] = [];
  if (sales.total.exempt > 0) {
    warnings.push("本期有免稅銷售額：兼營應稅及免稅之營業人應使用 403 申報書並依比例計算不得扣抵之進項稅額，本系統 401 計算結果僅供參考。");
  }
  const carry = resolveCarryIn(period);
  if (carry.warning) warnings.push(carry.warning);

  const outputTax = sales.total.taxable.tax;
  const inputTax = purchases.total.expense.tax + purchases.total.fixedAsset.tax;
  const net = outputTax - inputTax - carry.amount;
  const payable = Math.max(net, 0);
  const excess = Math.max(-net, 0);
  // 退稅限額 = 零稅率銷售額 × 5% ＋ 得扣抵之固定資產進項稅額
  const refundLimit = Math.round((sales.total.zeroRated * 0.05) / 100) * 100 + Math.max(purchases.total.fixedAsset.tax, 0);
  const refund = Math.min(excess, refundLimit);
  return {
    period,
    label: vatPeriodLabel(period),
    sales,
    purchases,
    outputTax,
    inputTax,
    carryIn: carry.amount,
    carryInSource: carry.source,
    payable,
    excess,
    refundLimit,
    refund,
    carryOut: excess - refund,
    warnings,
  };
}

/** 檢查申報人資料 */
export function getFilerInfo() {
  const company = getCompanyInfo();
  const taxRegNo = getSetting("company.tax_reg_no", "");
  const errors: string[] = [];
  if (!/^\d{8}$/.test(company.taxId)) errors.push("系統設定之公司統一編號須為 8 碼數字");
  if (!/^\d{9}$/.test(taxRegNo)) errors.push("請於系統設定填寫 9 碼稅籍編號");
  return { taxId: company.taxId, taxRegNo, errors };
}

/** 產生媒體申報檔內容（每行 81 字元，CRLF 換行） */
export function buildMediaFile(period: string): { filename: string; content: string; count: number } {
  const filer = getFilerInfo();
  if (filer.errors.length) throw new AppError(filer.errors.join("；"));
  const { records, problems } = collectVatRecords(period);
  if (problems.length) throw new AppError(`尚有 ${problems.length} 筆憑證資料不完整，請先修正後再匯出`);
  const lines = records.map((r, i) => formatRecord(r, filer.taxRegNo, i + 1));
  return { filename: `${filer.taxId}.TXT`, content: lines.length ? lines.join("\r\n") + "\r\n" : "", count: lines.length };
}

/** 帳載核對：期間內銷項、進項稅額科目之帳列發生額（不含營業稅結轉傳票） */
export function getLedgerVat(period: string) {
  const { from, to } = vatPeriodRange(period);
  const row = (accountId: number, sign: 1 | -1) =>
    (
      getDb()
        .prepare(
          `SELECT COALESCE(SUM(g.debit - g.credit), 0) net FROM gl_entries g JOIN vouchers v ON v.id = g.voucher_id
           WHERE g.account_id = ? AND g.entry_date BETWEEN ? AND ? AND v.source != 'vat'`,
        )
        .get(accountId, from, to) as { net: number }
    ).net * sign;
  return { outputTax: row(getMappedAccountId("acct.output_vat"), -1), inputTax: row(getMappedAccountId("acct.input_vat"), 1) };
}

/**
 * 確認申報：保存 401 計算結果、產生營業稅結轉傳票並鎖定本期憑證。
 *  借 銷項稅額／貸 進項稅額、留抵稅額（上期），差額：
 *   應納 → 貸 應付營業稅；溢付 → 借 應收退稅款（應退稅額）、留抵稅額（累積留抵）
 */
export function fileVatPeriod(period: string, userId: number) {
  assert(/^\d{4}-(01|03|05|07|09|11)$/.test(period), "申報期別不正確");
  return tx((db) => {
    assert(!getFiling(period), `${vatPeriodLabel(period)}已申報`);
    const later = db.prepare("SELECT period FROM vat_filings WHERE period > ? LIMIT 1").get(period);
    assert(!later, "已有較後期別之申報紀錄，不可補申報較早期別");
    const filer = getFilerInfo();
    if (filer.errors.length) throw new AppError(filer.errors.join("；"));
    const { records, problems } = collectVatRecords(period);
    if (problems.length) throw new AppError(`尚有 ${problems.length} 筆憑證資料不完整，請先修正`);
    const r = computeVat401(period, records);
    const { to } = vatPeriodRange(period);

    let voucherId: number | null = null;
    if (r.outputTax !== 0 || r.inputTax !== 0) {
      const memo = `${r.label}營業稅結轉`;
      const lines: VoucherLineInput[] = [];
      const add = (key: string, debit: number, credit: number) => {
        if (debit > 0 || credit > 0) lines.push({ accountId: getMappedAccountId(key), debit, credit, description: memo });
      };
      // 銷項或進項為負數（折讓大於當期發票）時改列相反方向
      add("acct.output_vat", Math.max(r.outputTax, 0), Math.max(-r.outputTax, 0));
      add("acct.input_vat", Math.max(-r.inputTax, 0), Math.max(r.inputTax, 0));
      add("acct.vat_credit", 0, r.carryIn);
      add("acct.vat_payable", 0, r.payable);
      add("acct.vat_refund", r.refund, 0);
      add("acct.vat_credit", r.carryOut, 0);
      voucherId = createVoucher({ voucherDate: to, voucherType: "transfer", description: memo, lines, source: "vat" }, userId, { autoPost: true });
    }
    db.prepare(
      `INSERT INTO vat_filings (period, carry_in, output_tax, input_tax, payable, refund, carry_out, data, voucher_id, filed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(period, r.carryIn, r.outputTax, r.inputTax, r.payable, r.refund, r.carryOut, JSON.stringify(r), voucherId, userId);
    audit(userId, "file", "vat", period, { outputTax: r.outputTax, inputTax: r.inputTax, payable: r.payable, refund: r.refund, carryOut: r.carryOut });
    return r;
  });
}

/** 取消申報（僅限最近一期）：作廢結轉傳票並解除憑證鎖定 */
export function unfileVatPeriod(period: string, userId: number) {
  tx((db) => {
    const f = getFiling(period);
    assert(f, "此期別尚未申報");
    const later = db.prepare("SELECT period FROM vat_filings WHERE period > ? LIMIT 1").get(period);
    assert(!later, "僅能取消最近一期之申報");
    if (f.voucher_id) voidVoucher(f.voucher_id, userId, `取消${vatPeriodLabel(period)}營業稅申報`, { internal: true });
    db.prepare("DELETE FROM vat_filings WHERE period = ?").run(period);
    audit(userId, "unfile", "vat", period);
  });
}
