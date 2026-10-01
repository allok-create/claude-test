import { getDb, tx } from "../db";
import { AppError, assert } from "../utils/errors";
import { audit } from "./audit";

/** 客戶與供應商主檔 */

export type PartnerKind = "customer" | "vendor";

export type Partner = {
  id: number;
  code: string;
  name: string;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms_days: number;
  credit_limit?: number;
  bank_account?: string | null;
  is_active: number;
  notes: string | null;
  created_at: string;
};

export type PartnerInput = {
  code: string;
  name: string;
  taxId?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTermsDays: number;
  creditLimit?: number; // 分（客戶）
  bankAccount?: string | null; // 供應商
  isActive: boolean;
  notes?: string | null;
};

const TABLE: Record<PartnerKind, string> = { customer: "customers", vendor: "vendors" };
export const PARTNER_LABEL: Record<PartnerKind, string> = { customer: "客戶", vendor: "供應商" };

function validate(input: PartnerInput) {
  assert(/^[0-9A-Za-z_-]{1,20}$/.test(input.code), "編號須為 1–20 碼英數字");
  assert(input.name.trim(), "請輸入名稱");
  if (input.taxId) assert(/^\d{8}$/.test(input.taxId), "統一編號須為 8 碼數字");
  if (input.email) assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email), "電子郵件格式不正確");
  assert(Number.isInteger(input.paymentTermsDays) && input.paymentTermsDays >= 0 && input.paymentTermsDays <= 365, "付款條件天數須介於 0–365");
}

export function listPartners(kind: PartnerKind, opts: { q?: string; activeOnly?: boolean } = {}): Partner[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.activeOnly) where.push("is_active = 1");
  if (opts.q) {
    where.push("(code LIKE ? OR name LIKE ? OR tax_id LIKE ? OR contact_person LIKE ?)");
    params.push(...Array(4).fill(`%${opts.q}%`));
  }
  return getDb()
    .prepare(`SELECT * FROM ${TABLE[kind]} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY code`)
    .all(...params) as Partner[];
}

export function getPartner(kind: PartnerKind, id: number): Partner | undefined {
  return getDb().prepare(`SELECT * FROM ${TABLE[kind]} WHERE id = ?`).get(id) as Partner | undefined;
}

export function createPartner(kind: PartnerKind, input: PartnerInput, userId: number): number {
  validate(input);
  const db = getDb();
  const extraCol = kind === "customer" ? "credit_limit" : "bank_account";
  const extraVal = kind === "customer" ? input.creditLimit ?? 0 : input.bankAccount || null;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO ${TABLE[kind]} (code, name, tax_id, contact_person, phone, email, address, payment_terms_days, ${extraCol}, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.code,
      input.name.trim(),
      input.taxId || null,
      input.contactPerson || null,
      input.phone || null,
      input.email || null,
      input.address || null,
      input.paymentTermsDays,
      extraVal,
      input.isActive ? 1 : 0,
      input.notes || null,
    );
  audit(userId, "create", kind, Number(lastInsertRowid), { code: input.code, name: input.name });
  return Number(lastInsertRowid);
}

export function updatePartner(kind: PartnerKind, id: number, input: PartnerInput, userId: number) {
  validate(input);
  assert(getPartner(kind, id), `${PARTNER_LABEL[kind]}不存在`);
  const extraCol = kind === "customer" ? "credit_limit" : "bank_account";
  const extraVal = kind === "customer" ? input.creditLimit ?? 0 : input.bankAccount || null;
  getDb()
    .prepare(
      `UPDATE ${TABLE[kind]} SET code = ?, name = ?, tax_id = ?, contact_person = ?, phone = ?, email = ?, address = ?,
         payment_terms_days = ?, ${extraCol} = ?, is_active = ?, notes = ? WHERE id = ?`,
    )
    .run(
      input.code,
      input.name.trim(),
      input.taxId || null,
      input.contactPerson || null,
      input.phone || null,
      input.email || null,
      input.address || null,
      input.paymentTermsDays,
      extraVal,
      input.isActive ? 1 : 0,
      input.notes || null,
      id,
    );
  audit(userId, "update", kind, id, { code: input.code, name: input.name });
}

export function deletePartner(kind: PartnerKind, id: number, userId: number) {
  tx((db) => {
    const p = getPartner(kind, id);
    assert(p, `${PARTNER_LABEL[kind]}不存在`);
    const docTable = kind === "customer" ? "ar_invoices" : "ap_bills";
    const fk = kind === "customer" ? "customer_id" : "vendor_id";
    const used =
      db.prepare(`SELECT 1 FROM ${docTable} WHERE ${fk} = ? LIMIT 1`).get(id) ||
      db.prepare("SELECT 1 FROM voucher_lines WHERE partner_type = ? AND partner_id = ? LIMIT 1").get(kind, id);
    if (used) throw new AppError(`此${PARTNER_LABEL[kind]}已有交易紀錄，無法刪除，請改為停用`);
    db.prepare(`DELETE FROM ${TABLE[kind]} WHERE id = ?`).run(id);
    audit(userId, "delete", kind, id, { code: p.code, name: p.name });
  });
}

/** 對象交易彙總：未結餘額 */
export function getPartnerBalances(kind: PartnerKind): Map<number, number> {
  const sql =
    kind === "customer"
      ? "SELECT customer_id id, SUM(total - paid_amount) bal FROM ar_invoices WHERE status IN ('open','partial') GROUP BY customer_id"
      : "SELECT vendor_id id, SUM(total - paid_amount) bal FROM ap_bills WHERE status IN ('open','partial') GROUP BY vendor_id";
  const rows = getDb().prepare(sql).all() as { id: number; bal: number }[];
  return new Map(rows.map((r) => [r.id, r.bal]));
}
