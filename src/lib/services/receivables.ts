import { getDb, tx } from "../db";
import { AppError, assert } from "../utils/errors";
import { addDays, daysBetween, isValidDate, today } from "../utils/date";
import { calcTax } from "../utils/money";
import { audit } from "./audit";
import { recordStockMovement } from "./inventory";
import { nextNumber } from "./sequences";
import { assertPeriodOpen, getMappedAccountId } from "./settings";
import { createVoucher, voidVoucher, type VoucherLineInput } from "./vouchers";

/**
 * 應收帳款：銷貨開立應收單 → 自動產生傳票（含銷貨成本）→ 收款沖帳。
 */

export type DocStatus = "open" | "partial" | "paid" | "void";
export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  open: "未收款",
  partial: "部分收款",
  paid: "已結清",
  void: "已作廢",
};

export type TradeLineInput = {
  productId?: number | null;
  accountId?: number | null;
  description: string;
  quantity: number;
  unitPrice: number; // 分
};

export type InvoiceInput = {
  customerId: number;
  invoiceDate: string;
  dueDate?: string | null;
  guiNo?: string | null;
  description?: string | null;
  taxRate: number;
  lines: TradeLineInput[];
};

export type ArInvoice = {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  gui_no: string | null;
  description: string | null;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  status: DocStatus;
  voucher_id: number | null;
  voucher_no: string | null;
  created_at: string;
};

export const TAX_RATE_OPTIONS = [
  { value: 0.05, label: "應稅 5%" },
  { value: 0, label: "零稅率／免稅" },
];

function statusFor(total: number, paid: number): DocStatus {
  if (paid <= 0) return "open";
  return paid >= total ? "paid" : "partial";
}

export function computeLines(lines: TradeLineInput[]) {
  const valid = lines.filter((l) => l.description?.trim() || l.productId);
  assert(valid.length > 0, "請至少輸入一筆明細");
  return valid.map((l, i) => {
    assert(Number.isFinite(l.quantity) && l.quantity > 0, `第 ${i + 1} 列數量須大於 0`);
    assert(Number.isInteger(l.unitPrice) && l.unitPrice >= 0, `第 ${i + 1} 列單價不正確`);
    return { ...l, description: l.description?.trim() || "", amount: Math.round(l.quantity * l.unitPrice) };
  });
}

export function createInvoice(input: InvoiceInput, userId: number): number {
  assert(isValidDate(input.invoiceDate), "發票日期格式不正確");
  assert([0, 0.05].includes(input.taxRate), "稅率不正確");
  return tx((db) => {
    assertPeriodOpen(input.invoiceDate);
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(input.customerId) as
      | { id: number; name: string; payment_terms_days: number; is_active: number; credit_limit: number }
      | undefined;
    assert(customer, "請選擇客戶");
    assert(customer.is_active, "此客戶已停用");
    const dueDate = input.dueDate || addDays(input.invoiceDate, customer.payment_terms_days);
    assert(isValidDate(dueDate) && dueDate >= input.invoiceDate, "到期日不可早於發票日期");

    const lines = computeLines(input.lines);
    const salesAccount = getMappedAccountId("acct.sales");
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = calcTax(subtotal, input.taxRate);
    const total = subtotal + taxAmount;
    assert(total > 0, "應收金額須大於 0");

    if (customer.credit_limit > 0) {
      const outstanding = (
        db.prepare("SELECT COALESCE(SUM(total - paid_amount),0) s FROM ar_invoices WHERE customer_id = ? AND status IN ('open','partial')").get(customer.id) as { s: number }
      ).s;
      if (outstanding + total > customer.credit_limit) {
        throw new AppError(`超過客戶信用額度：未收餘額 ${(outstanding / 100).toLocaleString()} 元 + 本次 ${(total / 100).toLocaleString()} 元 > 額度 ${(customer.credit_limit / 100).toLocaleString()} 元`);
      }
    }

    const invoiceNo = nextNumber("AR", input.invoiceDate.slice(0, 7).replace("-", ""));
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO ar_invoices (invoice_no, customer_id, invoice_date, due_date, gui_no, description, tax_rate, subtotal, tax_amount, total, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(invoiceNo, customer.id, input.invoiceDate, dueDate, input.guiNo || null, input.description || null, input.taxRate, subtotal, taxAmount, total, userId);
    const invoiceId = Number(lastInsertRowid);

    const insertLine = db.prepare(
      `INSERT INTO ar_invoice_lines (invoice_id, line_no, product_id, account_id, description, quantity, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const revenueByAccount = new Map<number, number>();
    let cogs = 0;
    const txnIds: number[] = [];
    lines.forEach((l, i) => {
      const accountId = l.accountId || salesAccount;
      let description = l.description;
      if (l.productId) {
        const p = db.prepare("SELECT sku, name FROM products WHERE id = ?").get(l.productId) as { sku: string; name: string } | undefined;
        assert(p, `第 ${i + 1} 列商品不存在`);
        description ||= p.name;
        const { totalCost, txnId } = recordStockMovement(db, {
          productId: l.productId,
          date: input.invoiceDate,
          type: "sale",
          quantity: -l.quantity,
          sourceType: "ar_invoice",
          sourceId: invoiceId,
          description: `銷貨 ${invoiceNo} ${customer.name}`,
          userId,
        });
        cogs += -totalCost;
        txnIds.push(txnId);
      }
      insertLine.run(invoiceId, i + 1, l.productId || null, accountId, description, l.quantity, l.unitPrice, l.amount);
      revenueByAccount.set(accountId, (revenueByAccount.get(accountId) ?? 0) + l.amount);
    });

    const memo = `銷貨 ${invoiceNo} ${customer.name}`;
    const vLines: VoucherLineInput[] = [
      { accountId: getMappedAccountId("acct.ar"), debit: total, credit: 0, description: memo, partnerType: "customer", partnerId: customer.id },
    ];
    for (const [accountId, amount] of revenueByAccount) {
      if (amount > 0) vLines.push({ accountId, debit: 0, credit: amount, description: memo });
    }
    if (taxAmount > 0) vLines.push({ accountId: getMappedAccountId("acct.output_vat"), debit: 0, credit: taxAmount, description: memo });
    if (cogs > 0) {
      vLines.push({ accountId: getMappedAccountId("acct.cogs"), debit: cogs, credit: 0, description: `銷貨成本 ${invoiceNo}` });
      vLines.push({ accountId: getMappedAccountId("acct.inventory"), debit: 0, credit: cogs, description: `銷貨成本 ${invoiceNo}` });
    }
    const voucherId = createVoucher(
      { voucherDate: input.invoiceDate, voucherType: "transfer", description: memo, lines: vLines, source: "ar_invoice", sourceId: invoiceId },
      userId,
      { autoPost: true },
    );
    db.prepare("UPDATE ar_invoices SET voucher_id = ? WHERE id = ?").run(voucherId, invoiceId);
    if (txnIds.length) {
      db.prepare(`UPDATE inventory_transactions SET voucher_id = ? WHERE id IN (${txnIds.map(() => "?").join(",")})`).run(voucherId, ...txnIds);
    }
    audit(userId, "create", "ar_invoice", invoiceId, { invoiceNo, total });
    return invoiceId;
  });
}

/** 作廢應收單：須無收款紀錄；連動作廢傳票並回沖庫存 */
export function voidInvoice(id: number, reason: string, userId: number) {
  assert(reason.trim(), "請輸入作廢原因");
  tx((db) => {
    const inv = getInvoice(id);
    assert(inv, "應收單不存在");
    assert(inv.status !== "void", "應收單已作廢");
    assert(inv.paid_amount === 0, "已有收款沖帳，請先作廢收款單");
    assertPeriodOpen(inv.invoice_date);
    const txns = db
      .prepare("SELECT product_id, quantity, unit_cost FROM inventory_transactions WHERE source_type = 'ar_invoice' AND source_id = ? AND txn_type = 'sale'")
      .all(id) as { product_id: number; quantity: number; unit_cost: number }[];
    for (const t of txns) {
      recordStockMovement(db, {
        productId: t.product_id,
        date: inv.invoice_date,
        type: "sale_void",
        quantity: -t.quantity,
        unitCost: t.unit_cost,
        sourceType: "ar_invoice",
        sourceId: id,
        voucherId: inv.voucher_id,
        description: `作廢銷貨 ${inv.invoice_no}`,
        userId,
      });
    }
    if (inv.voucher_id) voidVoucher(inv.voucher_id, userId, `應收單作廢：${reason}`, { internal: true });
    db.prepare("UPDATE ar_invoices SET status = 'void' WHERE id = ?").run(id);
    audit(userId, "void", "ar_invoice", id, { invoiceNo: inv.invoice_no, reason });
  });
}

const INVOICE_SELECT = `SELECT i.*, c.code customer_code, c.name customer_name, v.voucher_no
  FROM ar_invoices i JOIN customers c ON c.id = i.customer_id LEFT JOIN vouchers v ON v.id = i.voucher_id`;

export function getInvoice(id: number): ArInvoice | undefined {
  return getDb().prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(id) as ArInvoice | undefined;
}

export function getInvoiceLines(id: number) {
  return getDb()
    .prepare(
      `SELECT l.*, a.code account_code, a.name account_name, p.sku, p.unit FROM ar_invoice_lines l
       JOIN accounts a ON a.id = l.account_id LEFT JOIN products p ON p.id = l.product_id
       WHERE l.invoice_id = ? ORDER BY l.line_no`,
    )
    .all(id) as {
    id: number;
    line_no: number;
    product_id: number | null;
    sku: string | null;
    unit: string | null;
    account_code: string;
    account_name: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
}

export function listInvoices(filter: { customerId?: number; status?: string; from?: string; to?: string; openOnly?: boolean } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.customerId) {
    where.push("i.customer_id = ?");
    params.push(filter.customerId);
  }
  if (filter.status) {
    where.push("i.status = ?");
    params.push(filter.status);
  }
  if (filter.openOnly) where.push("i.status IN ('open','partial')");
  if (filter.from) {
    where.push("i.invoice_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("i.invoice_date <= ?");
    params.push(filter.to);
  }
  return getDb()
    .prepare(`${INVOICE_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY i.invoice_date DESC, i.id DESC LIMIT 500`)
    .all(...params) as ArInvoice[];
}

export type ReceiptInput = {
  customerId: number;
  receiptDate: string;
  accountId: number;
  amount: number; // 分
  description?: string | null;
  allocations?: { invoiceId: number; amount: number }[];
};

/** 收款沖帳：未指定沖銷明細時，依到期日先後自動沖銷 */
export function createReceipt(input: ReceiptInput, userId: number): number {
  assert(isValidDate(input.receiptDate), "收款日期格式不正確");
  assert(Number.isInteger(input.amount) && input.amount > 0, "收款金額須大於 0");
  return tx((db) => {
    assertPeriodOpen(input.receiptDate);
    const customer = db.prepare("SELECT id, name FROM customers WHERE id = ?").get(input.customerId) as { id: number; name: string } | undefined;
    assert(customer, "請選擇客戶");
    const cashAcc = db.prepare("SELECT id, is_detail FROM accounts WHERE id = ?").get(input.accountId) as { id: number; is_detail: number } | undefined;
    assert(cashAcc?.is_detail, "請選擇收款科目");

    const open = db
      .prepare("SELECT id, invoice_no, total, paid_amount FROM ar_invoices WHERE customer_id = ? AND status IN ('open','partial') ORDER BY due_date, id")
      .all(customer.id) as { id: number; invoice_no: string; total: number; paid_amount: number }[];
    let allocations = (input.allocations ?? []).filter((a) => a.amount > 0);
    if (allocations.length === 0) {
      let remaining = input.amount;
      allocations = [];
      for (const inv of open) {
        if (remaining <= 0) break;
        const amt = Math.min(remaining, inv.total - inv.paid_amount);
        allocations.push({ invoiceId: inv.id, amount: amt });
        remaining -= amt;
      }
    }
    const allocated = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocated !== input.amount) {
      throw new AppError(`收款金額 ${(input.amount / 100).toLocaleString()} 元與沖銷合計 ${(allocated / 100).toLocaleString()} 元不符（收款金額不可超過未收餘額）`);
    }
    for (const a of allocations) {
      const inv = open.find((o) => o.id === a.invoiceId);
      assert(inv, "沖銷之應收單不存在或已結清");
      assert(Number.isInteger(a.amount) && a.amount <= inv.total - inv.paid_amount, `應收單 ${inv.invoice_no} 沖銷金額超過未收餘額`);
    }

    const receiptNo = nextNumber("RC", input.receiptDate.slice(0, 7).replace("-", ""));
    const { lastInsertRowid } = db
      .prepare("INSERT INTO ar_receipts (receipt_no, customer_id, receipt_date, account_id, amount, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(receiptNo, customer.id, input.receiptDate, input.accountId, input.amount, input.description || null, userId);
    const receiptId = Number(lastInsertRowid);
    const insAlloc = db.prepare("INSERT INTO ar_receipt_allocations (receipt_id, invoice_id, amount) VALUES (?, ?, ?)");
    const updInv = db.prepare("UPDATE ar_invoices SET paid_amount = ?, status = ? WHERE id = ?");
    for (const a of allocations) {
      const inv = open.find((o) => o.id === a.invoiceId)!;
      insAlloc.run(receiptId, a.invoiceId, a.amount);
      const paid = inv.paid_amount + a.amount;
      updInv.run(paid, statusFor(inv.total, paid), inv.id);
    }
    const memo = `收款 ${receiptNo} ${customer.name}`;
    const voucherId = createVoucher(
      {
        voucherDate: input.receiptDate,
        voucherType: "receipt",
        description: input.description ? `${memo}（${input.description}）` : memo,
        lines: [
          { accountId: input.accountId, debit: input.amount, credit: 0, description: memo },
          { accountId: getMappedAccountId("acct.ar"), debit: 0, credit: input.amount, description: memo, partnerType: "customer", partnerId: customer.id },
        ],
        source: "ar_receipt",
        sourceId: receiptId,
      },
      userId,
      { autoPost: true },
    );
    db.prepare("UPDATE ar_receipts SET voucher_id = ? WHERE id = ?").run(voucherId, receiptId);
    audit(userId, "create", "ar_receipt", receiptId, { receiptNo, amount: input.amount });
    return receiptId;
  });
}

/** 作廢收款：回復應收單未收餘額並作廢傳票 */
export function voidReceipt(id: number, reason: string, userId: number) {
  assert(reason.trim(), "請輸入作廢原因");
  tx((db) => {
    const r = db.prepare("SELECT * FROM ar_receipts WHERE id = ?").get(id) as { id: number; receipt_no: string; receipt_date: string; voucher_id: number | null } | undefined;
    assert(r, "收款單不存在");
    const v = r.voucher_id ? (db.prepare("SELECT status FROM vouchers WHERE id = ?").get(r.voucher_id) as { status: string }) : null;
    assert(v?.status !== "void", "收款單已作廢");
    assertPeriodOpen(r.receipt_date);
    const allocs = db.prepare("SELECT invoice_id, amount FROM ar_receipt_allocations WHERE receipt_id = ?").all(id) as { invoice_id: number; amount: number }[];
    for (const a of allocs) {
      const inv = db.prepare("SELECT total, paid_amount FROM ar_invoices WHERE id = ?").get(a.invoice_id) as { total: number; paid_amount: number };
      const paid = inv.paid_amount - a.amount;
      db.prepare("UPDATE ar_invoices SET paid_amount = ?, status = ? WHERE id = ?").run(paid, statusFor(inv.total, paid), a.invoice_id);
    }
    db.prepare("DELETE FROM ar_receipt_allocations WHERE receipt_id = ?").run(id);
    if (r.voucher_id) voidVoucher(r.voucher_id, userId, `收款作廢：${reason}`, { internal: true });
    audit(userId, "void", "ar_receipt", id, { receiptNo: r.receipt_no, reason });
  });
}

export type ReceiptRow = {
  id: number;
  receipt_no: string;
  customer_id: number;
  customer_name: string;
  receipt_date: string;
  account_code: string;
  account_name: string;
  amount: number;
  description: string | null;
  voucher_id: number | null;
  voucher_no: string | null;
  voucher_status: string | null;
  allocations: string | null;
};

export function listReceipts(filter: { customerId?: number; from?: string; to?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.customerId) {
    where.push("r.customer_id = ?");
    params.push(filter.customerId);
  }
  if (filter.from) {
    where.push("r.receipt_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("r.receipt_date <= ?");
    params.push(filter.to);
  }
  return getDb()
    .prepare(
      `SELECT r.*, c.name customer_name, a.code account_code, a.name account_name, v.voucher_no, v.status voucher_status,
         (SELECT GROUP_CONCAT(i.invoice_no, '、') FROM ar_receipt_allocations x JOIN ar_invoices i ON i.id = x.invoice_id WHERE x.receipt_id = r.id) allocations
       FROM ar_receipts r JOIN customers c ON c.id = r.customer_id JOIN accounts a ON a.id = r.account_id
       LEFT JOIN vouchers v ON v.id = r.voucher_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY r.receipt_date DESC, r.id DESC LIMIT 500`,
    )
    .all(...params) as ReceiptRow[];
}

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "over90";
export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "未到期",
  d30: "逾期 1–30 天",
  d60: "逾期 31–60 天",
  d90: "逾期 61–90 天",
  over90: "逾期 90 天以上",
};

export function bucketFor(dueDate: string, asOf: string): AgingBucket {
  const overdue = daysBetween(dueDate, asOf);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "d30";
  if (overdue <= 60) return "d60";
  if (overdue <= 90) return "d90";
  return "over90";
}

export type AgingRow = { partnerId: number; partnerCode: string; partnerName: string; buckets: Record<AgingBucket, number>; total: number };

/** 帳齡分析（依到期日） */
export function buildAging(
  docs: { partner_id: number; partner_code: string; partner_name: string; due_date: string; outstanding: number }[],
  asOf: string,
) {
  const map = new Map<number, AgingRow>();
  const totals: Record<AgingBucket, number> = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  for (const d of docs) {
    if (d.outstanding <= 0) continue;
    let row = map.get(d.partner_id);
    if (!row) {
      row = { partnerId: d.partner_id, partnerCode: d.partner_code, partnerName: d.partner_name, buckets: { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 }, total: 0 };
      map.set(d.partner_id, row);
    }
    const b = bucketFor(d.due_date, asOf);
    row.buckets[b] += d.outstanding;
    row.total += d.outstanding;
    totals[b] += d.outstanding;
  }
  const rows = [...map.values()].sort((a, b) => a.partnerCode.localeCompare(b.partnerCode));
  return { rows, totals, grandTotal: rows.reduce((s, r) => s + r.total, 0) };
}

/**
 * 應收帳齡：以 asOf 當日為基準，計算截至該日已開立且未沖銷之餘額。
 */
export function getArAging(asOf = today()) {
  const docs = getDb()
    .prepare(
      `SELECT i.customer_id partner_id, c.code partner_code, c.name partner_name, i.due_date,
         i.total - COALESCE((SELECT SUM(x.amount) FROM ar_receipt_allocations x JOIN ar_receipts r ON r.id = x.receipt_id
                             WHERE x.invoice_id = i.id AND r.receipt_date <= ?), 0) outstanding
       FROM ar_invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status != 'void' AND i.invoice_date <= ?`,
    )
    .all(asOf, asOf) as { partner_id: number; partner_code: string; partner_name: string; due_date: string; outstanding: number }[];
  return buildAging(docs, asOf);
}

export function getArSummary() {
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(total - paid_amount),0) outstanding,
         COALESCE(SUM(CASE WHEN due_date < ? THEN total - paid_amount ELSE 0 END),0) overdue,
         COUNT(*) count
       FROM ar_invoices WHERE status IN ('open','partial')`,
    )
    .get(today()) as { outstanding: number; overdue: number; count: number };
  return r;
}
