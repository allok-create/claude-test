import { getDb, tx } from "../db";
import { AppError, assert } from "../utils/errors";
import { addDays, isValidDate, today } from "../utils/date";
import { calcTax } from "../utils/money";
import { audit } from "./audit";
import { recordStockMovement } from "./inventory";
import { buildAging, computeLines, type DocStatus, type TradeLineInput } from "./receivables";
import { nextNumber } from "./sequences";
import { assertPeriodOpen, getMappedAccountId } from "./settings";
import { createVoucher, voidVoucher, type VoucherLineInput } from "./vouchers";

/**
 * 應付帳款：登錄進貨／費用帳單 → 自動產生傳票（存貨入庫）→ 付款沖帳。
 */

export const BILL_STATUS_LABELS: Record<DocStatus, string> = {
  open: "未付款",
  partial: "部分付款",
  paid: "已結清",
  void: "已作廢",
};

export type BillInput = {
  vendorId: number;
  billDate: string;
  dueDate?: string | null;
  vendorRef?: string | null;
  description?: string | null;
  taxRate: number;
  lines: TradeLineInput[];
};

export type ApBill = {
  id: number;
  bill_no: string;
  vendor_id: number;
  vendor_code: string;
  vendor_name: string;
  bill_date: string;
  due_date: string;
  vendor_ref: string | null;
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

function statusFor(total: number, paid: number): DocStatus {
  if (paid <= 0) return "open";
  return paid >= total ? "paid" : "partial";
}

export function createBill(input: BillInput, userId: number): number {
  assert(isValidDate(input.billDate), "帳單日期格式不正確");
  assert([0, 0.05].includes(input.taxRate), "稅率不正確");
  return tx((db) => {
    assertPeriodOpen(input.billDate);
    const vendor = db.prepare("SELECT * FROM vendors WHERE id = ?").get(input.vendorId) as
      | { id: number; name: string; payment_terms_days: number; is_active: number }
      | undefined;
    assert(vendor, "請選擇供應商");
    assert(vendor.is_active, "此供應商已停用");
    const dueDate = input.dueDate || addDays(input.billDate, vendor.payment_terms_days);
    assert(isValidDate(dueDate) && dueDate >= input.billDate, "到期日不可早於帳單日期");

    const lines = computeLines(input.lines);
    const inventoryAccount = getMappedAccountId("acct.inventory");
    const expenseAccount = getMappedAccountId("acct.purchase_expense");
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = calcTax(subtotal, input.taxRate);
    const total = subtotal + taxAmount;
    assert(total > 0, "應付金額須大於 0");

    const billNo = nextNumber("AP", input.billDate.slice(0, 7).replace("-", ""));
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO ap_bills (bill_no, vendor_id, bill_date, due_date, vendor_ref, description, tax_rate, subtotal, tax_amount, total, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(billNo, vendor.id, input.billDate, dueDate, input.vendorRef || null, input.description || null, input.taxRate, subtotal, taxAmount, total, userId);
    const billId = Number(lastInsertRowid);

    const insertLine = db.prepare(
      `INSERT INTO ap_bill_lines (bill_id, line_no, product_id, account_id, description, quantity, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const debitByAccount = new Map<number, number>();
    const txnIds: number[] = [];
    lines.forEach((l, i) => {
      let accountId = l.accountId || expenseAccount;
      let description = l.description;
      if (l.productId) {
        const p = db.prepare("SELECT sku, name FROM products WHERE id = ?").get(l.productId) as { sku: string; name: string } | undefined;
        assert(p, `第 ${i + 1} 列商品不存在`);
        description ||= p.name;
        accountId = inventoryAccount;
        const { txnId } = recordStockMovement(db, {
          productId: l.productId,
          date: input.billDate,
          type: "purchase",
          quantity: l.quantity,
          unitCost: l.amount / l.quantity,
          sourceType: "ap_bill",
          sourceId: billId,
          description: `進貨 ${billNo} ${vendor.name}`,
          userId,
        });
        txnIds.push(txnId);
      }
      insertLine.run(billId, i + 1, l.productId || null, accountId, description, l.quantity, l.unitPrice, l.amount);
      debitByAccount.set(accountId, (debitByAccount.get(accountId) ?? 0) + l.amount);
    });

    const memo = `進貨／費用 ${billNo} ${vendor.name}`;
    const vLines: VoucherLineInput[] = [];
    for (const [accountId, amount] of debitByAccount) {
      if (amount > 0) vLines.push({ accountId, debit: amount, credit: 0, description: memo });
    }
    if (taxAmount > 0) vLines.push({ accountId: getMappedAccountId("acct.input_vat"), debit: taxAmount, credit: 0, description: memo });
    vLines.push({ accountId: getMappedAccountId("acct.ap"), debit: 0, credit: total, description: memo, partnerType: "vendor", partnerId: vendor.id });

    const voucherId = createVoucher(
      { voucherDate: input.billDate, voucherType: "transfer", description: memo, lines: vLines, source: "ap_bill", sourceId: billId },
      userId,
      { autoPost: true },
    );
    db.prepare("UPDATE ap_bills SET voucher_id = ? WHERE id = ?").run(voucherId, billId);
    if (txnIds.length) {
      db.prepare(`UPDATE inventory_transactions SET voucher_id = ? WHERE id IN (${txnIds.map(() => "?").join(",")})`).run(voucherId, ...txnIds);
    }
    audit(userId, "create", "ap_bill", billId, { billNo, total });
    return billId;
  });
}

/** 作廢應付單：須無付款紀錄；連動作廢傳票並沖回庫存 */
export function voidBill(id: number, reason: string, userId: number) {
  assert(reason.trim(), "請輸入作廢原因");
  tx((db) => {
    const bill = getBill(id);
    assert(bill, "應付單不存在");
    assert(bill.status !== "void", "應付單已作廢");
    assert(bill.paid_amount === 0, "已有付款沖帳，請先作廢付款單");
    assertPeriodOpen(bill.bill_date);
    const txns = db
      .prepare("SELECT product_id, quantity, unit_cost FROM inventory_transactions WHERE source_type = 'ap_bill' AND source_id = ? AND txn_type = 'purchase'")
      .all(id) as { product_id: number; quantity: number; unit_cost: number }[];
    for (const t of txns) {
      recordStockMovement(db, {
        productId: t.product_id,
        date: bill.bill_date,
        type: "purchase_void",
        quantity: -t.quantity,
        unitCost: t.unit_cost,
        sourceType: "ap_bill",
        sourceId: id,
        voucherId: bill.voucher_id,
        description: `作廢進貨 ${bill.bill_no}`,
        userId,
      });
    }
    if (bill.voucher_id) voidVoucher(bill.voucher_id, userId, `應付單作廢：${reason}`, { internal: true });
    db.prepare("UPDATE ap_bills SET status = 'void' WHERE id = ?").run(id);
    audit(userId, "void", "ap_bill", id, { billNo: bill.bill_no, reason });
  });
}

const BILL_SELECT = `SELECT b.*, ve.code vendor_code, ve.name vendor_name, v.voucher_no
  FROM ap_bills b JOIN vendors ve ON ve.id = b.vendor_id LEFT JOIN vouchers v ON v.id = b.voucher_id`;

export function getBill(id: number): ApBill | undefined {
  return getDb().prepare(`${BILL_SELECT} WHERE b.id = ?`).get(id) as ApBill | undefined;
}

export function getBillLines(id: number) {
  return getDb()
    .prepare(
      `SELECT l.*, a.code account_code, a.name account_name, p.sku, p.unit FROM ap_bill_lines l
       JOIN accounts a ON a.id = l.account_id LEFT JOIN products p ON p.id = l.product_id
       WHERE l.bill_id = ? ORDER BY l.line_no`,
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

export function listBills(filter: { vendorId?: number; status?: string; from?: string; to?: string; openOnly?: boolean } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.vendorId) {
    where.push("b.vendor_id = ?");
    params.push(filter.vendorId);
  }
  if (filter.status) {
    where.push("b.status = ?");
    params.push(filter.status);
  }
  if (filter.openOnly) where.push("b.status IN ('open','partial')");
  if (filter.from) {
    where.push("b.bill_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("b.bill_date <= ?");
    params.push(filter.to);
  }
  return getDb()
    .prepare(`${BILL_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY b.bill_date DESC, b.id DESC LIMIT 500`)
    .all(...params) as ApBill[];
}

export type PaymentInput = {
  vendorId: number;
  paymentDate: string;
  accountId: number;
  amount: number;
  description?: string | null;
  allocations?: { billId: number; amount: number }[];
};

/** 付款沖帳：未指定沖銷明細時，依到期日先後自動沖銷 */
export function createPayment(input: PaymentInput, userId: number): number {
  assert(isValidDate(input.paymentDate), "付款日期格式不正確");
  assert(Number.isInteger(input.amount) && input.amount > 0, "付款金額須大於 0");
  return tx((db) => {
    assertPeriodOpen(input.paymentDate);
    const vendor = db.prepare("SELECT id, name FROM vendors WHERE id = ?").get(input.vendorId) as { id: number; name: string } | undefined;
    assert(vendor, "請選擇供應商");
    const cashAcc = db.prepare("SELECT id, is_detail FROM accounts WHERE id = ?").get(input.accountId) as { id: number; is_detail: number } | undefined;
    assert(cashAcc?.is_detail, "請選擇付款科目");

    const open = db
      .prepare("SELECT id, bill_no, total, paid_amount FROM ap_bills WHERE vendor_id = ? AND status IN ('open','partial') ORDER BY due_date, id")
      .all(vendor.id) as { id: number; bill_no: string; total: number; paid_amount: number }[];
    let allocations = (input.allocations ?? []).filter((a) => a.amount > 0);
    if (allocations.length === 0) {
      let remaining = input.amount;
      allocations = [];
      for (const b of open) {
        if (remaining <= 0) break;
        const amt = Math.min(remaining, b.total - b.paid_amount);
        allocations.push({ billId: b.id, amount: amt });
        remaining -= amt;
      }
    }
    const allocated = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocated !== input.amount) {
      throw new AppError(`付款金額 ${(input.amount / 100).toLocaleString()} 元與沖銷合計 ${(allocated / 100).toLocaleString()} 元不符（付款金額不可超過未付餘額）`);
    }
    for (const a of allocations) {
      const b = open.find((o) => o.id === a.billId);
      assert(b, "沖銷之應付單不存在或已結清");
      assert(Number.isInteger(a.amount) && a.amount <= b.total - b.paid_amount, `應付單 ${b.bill_no} 沖銷金額超過未付餘額`);
    }

    const paymentNo = nextNumber("PY", input.paymentDate.slice(0, 7).replace("-", ""));
    const { lastInsertRowid } = db
      .prepare("INSERT INTO ap_payments (payment_no, vendor_id, payment_date, account_id, amount, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(paymentNo, vendor.id, input.paymentDate, input.accountId, input.amount, input.description || null, userId);
    const paymentId = Number(lastInsertRowid);
    const insAlloc = db.prepare("INSERT INTO ap_payment_allocations (payment_id, bill_id, amount) VALUES (?, ?, ?)");
    const updBill = db.prepare("UPDATE ap_bills SET paid_amount = ?, status = ? WHERE id = ?");
    for (const a of allocations) {
      const b = open.find((o) => o.id === a.billId)!;
      insAlloc.run(paymentId, a.billId, a.amount);
      const paid = b.paid_amount + a.amount;
      updBill.run(paid, statusFor(b.total, paid), b.id);
    }
    const memo = `付款 ${paymentNo} ${vendor.name}`;
    const voucherId = createVoucher(
      {
        voucherDate: input.paymentDate,
        voucherType: "payment",
        description: input.description ? `${memo}（${input.description}）` : memo,
        lines: [
          { accountId: getMappedAccountId("acct.ap"), debit: input.amount, credit: 0, description: memo, partnerType: "vendor", partnerId: vendor.id },
          { accountId: input.accountId, debit: 0, credit: input.amount, description: memo },
        ],
        source: "ap_payment",
        sourceId: paymentId,
      },
      userId,
      { autoPost: true },
    );
    db.prepare("UPDATE ap_payments SET voucher_id = ? WHERE id = ?").run(voucherId, paymentId);
    audit(userId, "create", "ap_payment", paymentId, { paymentNo, amount: input.amount });
    return paymentId;
  });
}

export function voidPayment(id: number, reason: string, userId: number) {
  assert(reason.trim(), "請輸入作廢原因");
  tx((db) => {
    const p = db.prepare("SELECT * FROM ap_payments WHERE id = ?").get(id) as { id: number; payment_no: string; payment_date: string; voucher_id: number | null } | undefined;
    assert(p, "付款單不存在");
    const v = p.voucher_id ? (db.prepare("SELECT status FROM vouchers WHERE id = ?").get(p.voucher_id) as { status: string }) : null;
    assert(v?.status !== "void", "付款單已作廢");
    assertPeriodOpen(p.payment_date);
    const allocs = db.prepare("SELECT bill_id, amount FROM ap_payment_allocations WHERE payment_id = ?").all(id) as { bill_id: number; amount: number }[];
    for (const a of allocs) {
      const b = db.prepare("SELECT total, paid_amount FROM ap_bills WHERE id = ?").get(a.bill_id) as { total: number; paid_amount: number };
      const paid = b.paid_amount - a.amount;
      db.prepare("UPDATE ap_bills SET paid_amount = ?, status = ? WHERE id = ?").run(paid, statusFor(b.total, paid), a.bill_id);
    }
    db.prepare("DELETE FROM ap_payment_allocations WHERE payment_id = ?").run(id);
    if (p.voucher_id) voidVoucher(p.voucher_id, userId, `付款作廢：${reason}`, { internal: true });
    audit(userId, "void", "ap_payment", id, { paymentNo: p.payment_no, reason });
  });
}

export type PaymentRow = {
  id: number;
  payment_no: string;
  vendor_id: number;
  vendor_name: string;
  payment_date: string;
  account_code: string;
  account_name: string;
  amount: number;
  description: string | null;
  voucher_id: number | null;
  voucher_no: string | null;
  voucher_status: string | null;
  allocations: string | null;
};

export function listPayments(filter: { vendorId?: number; from?: string; to?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.vendorId) {
    where.push("p.vendor_id = ?");
    params.push(filter.vendorId);
  }
  if (filter.from) {
    where.push("p.payment_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("p.payment_date <= ?");
    params.push(filter.to);
  }
  return getDb()
    .prepare(
      `SELECT p.*, ve.name vendor_name, a.code account_code, a.name account_name, v.voucher_no, v.status voucher_status,
         (SELECT GROUP_CONCAT(b.bill_no, '、') FROM ap_payment_allocations x JOIN ap_bills b ON b.id = x.bill_id WHERE x.payment_id = p.id) allocations
       FROM ap_payments p JOIN vendors ve ON ve.id = p.vendor_id JOIN accounts a ON a.id = p.account_id
       LEFT JOIN vouchers v ON v.id = p.voucher_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY p.payment_date DESC, p.id DESC LIMIT 500`,
    )
    .all(...params) as PaymentRow[];
}

export function getApAging(asOf = today()) {
  const docs = getDb()
    .prepare(
      `SELECT b.vendor_id partner_id, ve.code partner_code, ve.name partner_name, b.due_date,
         b.total - COALESCE((SELECT SUM(x.amount) FROM ap_payment_allocations x JOIN ap_payments p ON p.id = x.payment_id
                             WHERE x.bill_id = b.id AND p.payment_date <= ?), 0) outstanding
       FROM ap_bills b JOIN vendors ve ON ve.id = b.vendor_id
       WHERE b.status != 'void' AND b.bill_date <= ?`,
    )
    .all(asOf, asOf) as { partner_id: number; partner_code: string; partner_name: string; due_date: string; outstanding: number }[];
  return buildAging(docs, asOf);
}

export function getApSummary() {
  return getDb()
    .prepare(
      `SELECT COALESCE(SUM(total - paid_amount),0) outstanding,
         COALESCE(SUM(CASE WHEN due_date < ? THEN total - paid_amount ELSE 0 END),0) overdue,
         COUNT(*) count
       FROM ap_bills WHERE status IN ('open','partial')`,
    )
    .get(today()) as { outstanding: number; overdue: number; count: number };
}
