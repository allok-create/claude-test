import { getDb, tx, type DB } from "../db";
import { AppError, assert } from "../utils/errors";
import { isValidDate, nowTimestamp } from "../utils/date";
import { audit } from "./audit";
import { assertPeriodOpen, isAutoPostEnabled } from "./settings";
import { nextNumber } from "./sequences";

export type VoucherType = "receipt" | "payment" | "transfer";
export type VoucherStatus = "draft" | "posted" | "void";

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  receipt: "收入傳票",
  payment: "支出傳票",
  transfer: "轉帳傳票",
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: "未過帳",
  posted: "已過帳",
  void: "已作廢",
};

export const VOUCHER_SOURCE_LABELS: Record<string, string> = {
  manual: "手動輸入",
  ar_invoice: "應收帳款",
  ar_receipt: "應收收款",
  ap_bill: "應付帳款",
  ap_payment: "應付付款",
  inventory: "庫存調整",
};

export type VoucherLineInput = {
  accountId: number;
  description?: string | null;
  debit: number; // 分
  credit: number; // 分
  partnerType?: "customer" | "vendor" | null;
  partnerId?: number | null;
};

export type VoucherInput = {
  voucherDate: string;
  voucherType: VoucherType;
  description?: string | null;
  lines: VoucherLineInput[];
  source?: string;
  sourceId?: number | null;
};

export type Voucher = {
  id: number;
  voucher_no: string;
  voucher_date: string;
  voucher_type: VoucherType;
  description: string | null;
  status: VoucherStatus;
  source: string;
  source_id: number | null;
  total_amount: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  posted_by: number | null;
  posted_at: string | null;
  voided_by: number | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type VoucherLine = {
  id: number;
  voucher_id: number;
  line_no: number;
  account_id: number;
  account_code: string;
  account_name: string;
  description: string | null;
  debit: number;
  credit: number;
  partner_type: "customer" | "vendor" | null;
  partner_id: number | null;
  partner_name: string | null;
};

/** 驗證傳票：借貸平衡、每列僅借或貸、科目須為啟用中明細科目 */
export function validateVoucher(db: DB, input: VoucherInput) {
  assert(isValidDate(input.voucherDate), "傳票日期格式不正確");
  assert(["receipt", "payment", "transfer"].includes(input.voucherType), "傳票類別不正確");
  const lines = input.lines.filter((l) => l.debit !== 0 || l.credit !== 0 || l.accountId);
  assert(lines.length >= 2, "傳票至少需有兩筆分錄");
  let debit = 0;
  let credit = 0;
  const accountStmt = db.prepare("SELECT code, name, is_detail, is_active FROM accounts WHERE id = ?");
  lines.forEach((l, i) => {
    const row = i + 1;
    assert(l.accountId, `第 ${row} 列未選擇會計科目`);
    assert(Number.isInteger(l.debit) && Number.isInteger(l.credit), `第 ${row} 列金額格式不正確`);
    assert(l.debit >= 0 && l.credit >= 0, `第 ${row} 列金額不可為負數`);
    assert((l.debit > 0) !== (l.credit > 0), `第 ${row} 列須擇一輸入借方或貸方金額`);
    const acc = accountStmt.get(l.accountId) as { code: string; name: string; is_detail: number; is_active: number } | undefined;
    assert(acc, `第 ${row} 列科目不存在`);
    assert(acc.is_detail, `第 ${row} 列「${acc.code} ${acc.name}」為彙總科目，不可入帳`);
    assert(acc.is_active, `第 ${row} 列「${acc.code} ${acc.name}」已停用`);
    debit += l.debit;
    credit += l.credit;
  });
  if (debit !== credit) {
    throw new AppError(`借貸不平衡：借方合計 ${(debit / 100).toLocaleString()}，貸方合計 ${(credit / 100).toLocaleString()}`);
  }
  return { lines, total: debit };
}

function insertLines(db: DB, voucherId: number, lines: VoucherLineInput[]) {
  const stmt = db.prepare(
    `INSERT INTO voucher_lines (voucher_id, line_no, account_id, description, debit, credit, partner_type, partner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((l, i) =>
    stmt.run(
      voucherId,
      i + 1,
      l.accountId,
      l.description?.trim() || null,
      l.debit,
      l.credit,
      l.partnerId ? l.partnerType ?? null : null,
      l.partnerId && l.partnerType ? l.partnerId : null,
    ),
  );
}

/**
 * 建立傳票。
 * autoPost：未指定時依系統設定「自動過帳」決定；系統自動產生的傳票（應收、應付、庫存）一律過帳。
 */
export function createVoucher(input: VoucherInput, userId: number, opts: { autoPost?: boolean } = {}): number {
  return tx((db) => {
    assertPeriodOpen(input.voucherDate);
    const { lines, total } = validateVoucher(db, input);
    const voucherNo = nextNumber("", input.voucherDate.replace(/-/g, ""));
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, description, status, source, source_id, total_amount, created_by)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      )
      .run(
        voucherNo,
        input.voucherDate,
        input.voucherType,
        input.description?.trim() || null,
        input.source ?? "manual",
        input.sourceId ?? null,
        total,
        userId,
      );
    const id = Number(lastInsertRowid);
    insertLines(db, id, lines);
    audit(userId, "create", "voucher", id, { voucherNo });
    const shouldPost = opts.autoPost ?? isAutoPostEnabled();
    if (shouldPost) postVoucher(id, userId);
    return id;
  });
}

/** 修改未過帳傳票（系統自動產生者不可修改） */
export function updateVoucher(id: number, input: VoucherInput, userId: number) {
  tx((db) => {
    const v = getVoucher(id);
    assert(v, "傳票不存在");
    assert(v.status === "draft", "僅未過帳傳票可修改，已過帳傳票請先反過帳");
    assert(v.source === "manual", "系統自動產生的傳票不可直接修改，請由原始單據處理");
    assertPeriodOpen(v.voucher_date);
    assertPeriodOpen(input.voucherDate);
    const { lines, total } = validateVoucher(db, input);
    db.prepare(
      `UPDATE vouchers SET voucher_date = ?, voucher_type = ?, description = ?, total_amount = ?, updated_at = ? WHERE id = ?`,
    ).run(input.voucherDate, input.voucherType, input.description?.trim() || null, total, nowTimestamp(), id);
    db.prepare("DELETE FROM voucher_lines WHERE voucher_id = ?").run(id);
    insertLines(db, id, lines);
    audit(userId, "update", "voucher", id, { voucherNo: v.voucher_no });
  });
}

/** 刪除未過帳之手動傳票 */
export function deleteVoucher(id: number, userId: number) {
  tx((db) => {
    const v = getVoucher(id);
    assert(v, "傳票不存在");
    assert(v.status === "draft", "僅未過帳傳票可刪除");
    assert(v.source === "manual", "系統自動產生的傳票不可刪除");
    assertPeriodOpen(v.voucher_date);
    db.prepare("DELETE FROM vouchers WHERE id = ?").run(id);
    audit(userId, "delete", "voucher", id, { voucherNo: v.voucher_no });
  });
}

/**
 * 過帳：將傳票分錄寫入總帳（gl_entries），供日記簿、分類帳及各式報表使用。
 */
export function postVoucher(id: number, userId: number) {
  tx((db) => {
    const v = getVoucher(id);
    assert(v, "傳票不存在");
    assert(v.status === "draft", `傳票 ${v.voucher_no} 狀態為「${VOUCHER_STATUS_LABELS[v.status]}」，無法過帳`);
    assertPeriodOpen(v.voucher_date);
    // 過帳前重新驗證，確保資料完整
    const lines = db
      .prepare("SELECT account_id, description, debit, credit, partner_type, partner_id FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no")
      .all(id) as { account_id: number; description: string | null; debit: number; credit: number; partner_type: "customer" | "vendor" | null; partner_id: number | null }[];
    validateVoucher(db, {
      voucherDate: v.voucher_date,
      voucherType: v.voucher_type,
      lines: lines.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit })),
    });
    const now = nowTimestamp();
    db.prepare(
      `INSERT INTO gl_entries (voucher_id, voucher_line_id, entry_date, account_id, debit, credit, description, partner_type, partner_id, posted_at)
       SELECT l.voucher_id, l.id, ?, l.account_id, l.debit, l.credit, COALESCE(l.description, ?), l.partner_type, l.partner_id, ?
       FROM voucher_lines l WHERE l.voucher_id = ? ORDER BY l.line_no`,
    ).run(v.voucher_date, v.description, now, id);
    db.prepare("UPDATE vouchers SET status = 'posted', posted_by = ?, posted_at = ? WHERE id = ?").run(userId, now, id);
    audit(userId, "post", "voucher", id, { voucherNo: v.voucher_no });
  });
}

/** 反過帳：自總帳移除分錄並回復為未過帳 */
export function unpostVoucher(id: number, userId: number) {
  tx((db) => {
    const v = getVoucher(id);
    assert(v, "傳票不存在");
    assert(v.status === "posted", "僅已過帳傳票可反過帳");
    assert(v.source === "manual", "系統自動產生的傳票不可反過帳，請由原始單據作廢");
    assertPeriodOpen(v.voucher_date);
    db.prepare("DELETE FROM gl_entries WHERE voucher_id = ?").run(id);
    db.prepare("UPDATE vouchers SET status = 'draft', posted_by = NULL, posted_at = NULL WHERE id = ?").run(id);
    audit(userId, "unpost", "voucher", id, { voucherNo: v.voucher_no });
  });
}

/**
 * 作廢傳票：移除總帳分錄並標記作廢（保留原始紀錄以供稽核）。
 * internal = true 供應收／應付等模組作廢原始單據時連動使用。
 */
export function voidVoucher(id: number, userId: number, reason: string, opts: { internal?: boolean } = {}) {
  tx((db) => {
    const v = getVoucher(id);
    assert(v, "傳票不存在");
    assert(v.status !== "void", "傳票已作廢");
    if (!opts.internal) {
      assert(v.source === "manual", "系統自動產生的傳票請由原始單據作廢");
      assert(reason.trim().length > 0, "請輸入作廢原因");
    }
    assertPeriodOpen(v.voucher_date);
    db.prepare("DELETE FROM gl_entries WHERE voucher_id = ?").run(id);
    db.prepare("UPDATE vouchers SET status = 'void', voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ?").run(
      userId,
      nowTimestamp(),
      reason.trim() || null,
      id,
    );
    audit(userId, "void", "voucher", id, { voucherNo: v.voucher_no, reason });
  });
}

/** 批次過帳：將指定期間內所有未過帳傳票過帳 */
export function postAllDrafts(userId: number, range: { from?: string; to?: string } = {}) {
  const db = getDb();
  const where = ["status = 'draft'"];
  const params: string[] = [];
  if (range.from) {
    where.push("voucher_date >= ?");
    params.push(range.from);
  }
  if (range.to) {
    where.push("voucher_date <= ?");
    params.push(range.to);
  }
  const ids = db
    .prepare(`SELECT id, voucher_no FROM vouchers WHERE ${where.join(" AND ")} ORDER BY voucher_date, id`)
    .all(...params) as { id: number; voucher_no: string }[];
  const posted: string[] = [];
  const failed: { voucherNo: string; error: string }[] = [];
  for (const { id, voucher_no } of ids) {
    try {
      postVoucher(id, userId);
      posted.push(voucher_no);
    } catch (e) {
      failed.push({ voucherNo: voucher_no, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { posted, failed };
}

export function getVoucher(id: number): Voucher | undefined {
  return getDb().prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as Voucher | undefined;
}

export function getVoucherLines(voucherId: number): VoucherLine[] {
  return getDb()
    .prepare(
      `SELECT l.*, a.code account_code, a.name account_name,
         CASE l.partner_type WHEN 'customer' THEN c.name WHEN 'vendor' THEN v.name END partner_name
       FROM voucher_lines l
       JOIN accounts a ON a.id = l.account_id
       LEFT JOIN customers c ON l.partner_type = 'customer' AND c.id = l.partner_id
       LEFT JOIN vendors v ON l.partner_type = 'vendor' AND v.id = l.partner_id
       WHERE l.voucher_id = ? ORDER BY l.line_no`,
    )
    .all(voucherId) as VoucherLine[];
}

export type VoucherListRow = Voucher & { created_by_name: string | null; posted_by_name: string | null };

export function listVouchers(filter: { from?: string; to?: string; status?: string; type?: string; q?: string; limit?: number } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    where.push("v.voucher_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("v.voucher_date <= ?");
    params.push(filter.to);
  }
  if (filter.status) {
    where.push("v.status = ?");
    params.push(filter.status);
  }
  if (filter.type) {
    where.push("v.voucher_type = ?");
    params.push(filter.type);
  }
  if (filter.q) {
    where.push("(v.voucher_no LIKE ? OR v.description LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  return getDb()
    .prepare(
      `SELECT v.*, cu.display_name created_by_name, pu.display_name posted_by_name
       FROM vouchers v
       LEFT JOIN users cu ON cu.id = v.created_by
       LEFT JOIN users pu ON pu.id = v.posted_by
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY v.voucher_date DESC, v.id DESC LIMIT ?`,
    )
    .all(...params, filter.limit ?? 500) as VoucherListRow[];
}

export function countVouchersByStatus() {
  const rows = getDb().prepare("SELECT status, COUNT(*) c FROM vouchers GROUP BY status").all() as { status: VoucherStatus; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.c])) as Partial<Record<VoucherStatus, number>>;
}
