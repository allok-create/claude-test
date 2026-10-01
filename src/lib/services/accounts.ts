import { getDb, tx } from "../db";
import { normalBalanceFor } from "../db/seed";
import type { AccountType } from "../db/chart-of-accounts";
import { AppError, assert } from "../utils/errors";
import { audit } from "./audit";

export type Account = {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  category: string;
  normal_balance: "debit" | "credit";
  parent_id: number | null;
  level: number;
  is_detail: number;
  is_active: number;
  description: string | null;
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "資產",
  liability: "負債",
  equity: "權益",
  revenue: "收益",
  expense: "費損",
};

export const ACCOUNT_CATEGORIES: { value: string; label: string; type: AccountType }[] = [
  { value: "current_asset", label: "流動資產", type: "asset" },
  { value: "non_current_asset", label: "非流動資產", type: "asset" },
  { value: "current_liability", label: "流動負債", type: "liability" },
  { value: "non_current_liability", label: "非流動負債", type: "liability" },
  { value: "equity", label: "權益", type: "equity" },
  { value: "operating_revenue", label: "營業收入", type: "revenue" },
  { value: "non_operating_revenue", label: "營業外收益", type: "revenue" },
  { value: "cost_of_sales", label: "營業成本", type: "expense" },
  { value: "operating_expense", label: "營業費用", type: "expense" },
  { value: "non_operating_expense", label: "營業外費損", type: "expense" },
  { value: "income_tax", label: "所得稅費用", type: "expense" },
];

export function categoryLabel(category: string): string {
  return ACCOUNT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function listAccounts(opts: { activeOnly?: boolean; detailOnly?: boolean } = {}): Account[] {
  const where: string[] = [];
  if (opts.activeOnly) where.push("is_active = 1");
  if (opts.detailOnly) where.push("is_detail = 1");
  return getDb()
    .prepare(`SELECT * FROM accounts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY code`)
    .all() as Account[];
}

/** 可入帳的明細科目（供下拉選單使用） */
export function listPostableAccounts(): Pick<Account, "id" | "code" | "name" | "type">[] {
  return getDb()
    .prepare("SELECT id, code, name, type FROM accounts WHERE is_detail = 1 AND is_active = 1 ORDER BY code")
    .all() as Pick<Account, "id" | "code" | "name" | "type">[];
}

/** 現金及銀行類明細科目（收付款選用） */
export function listCashAccounts() {
  return getDb()
    .prepare(
      `SELECT a.id, a.code, a.name FROM accounts a
       WHERE a.is_detail = 1 AND a.is_active = 1 AND a.code LIKE '110%'
       ORDER BY a.code`,
    )
    .all() as { id: number; code: string; name: string }[];
}

export function getAccount(id: number): Account | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Account | undefined;
}

export function getAccountByCode(code: string): Account | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE code = ?").get(code) as Account | undefined;
}

export type AccountInput = {
  code: string;
  name: string;
  type: AccountType;
  category: string;
  parentId: number | null;
  normalBalance?: "debit" | "credit";
  description?: string | null;
  isActive?: boolean;
};

function validate(input: AccountInput) {
  assert(/^[0-9A-Za-z]{1,12}$/.test(input.code), "科目代碼須為 1–12 碼英數字");
  assert(input.name.trim().length > 0, "請輸入科目名稱");
  assert(Object.keys(ACCOUNT_TYPE_LABELS).includes(input.type), "科目類別不正確");
  assert(ACCOUNT_CATEGORIES.some((c) => c.value === input.category), "科目子分類不正確");
}

function hasEntries(accountId: number): boolean {
  const db = getDb();
  const r = db.prepare("SELECT 1 FROM voucher_lines WHERE account_id = ? LIMIT 1").get(accountId);
  return !!r;
}

export function createAccount(input: AccountInput, userId: number): number {
  validate(input);
  return tx((db) => {
    let level = 1;
    if (input.parentId) {
      const parent = getAccount(input.parentId);
      assert(parent, "上層科目不存在");
      assert(input.code.startsWith(parent.code), `科目代碼須以上層科目代碼「${parent.code}」開頭`);
      // 上層科目若已有分錄，不可再新增下層（避免已入帳之明細科目變成彙總科目）
      if (parent.is_detail && hasEntries(parent.id)) {
        throw new AppError(`上層科目「${parent.code} ${parent.name}」已有分錄，不可新增下層科目`);
      }
      level = parent.level + 1;
      db.prepare("UPDATE accounts SET is_detail = 0 WHERE id = ?").run(parent.id);
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO accounts (code, name, type, category, normal_balance, parent_id, level, is_detail, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.code,
        input.name.trim(),
        input.type,
        input.category,
        input.normalBalance ?? normalBalanceFor(input.type, input.code),
        input.parentId,
        level,
        input.isActive === false ? 0 : 1,
        input.description ?? null,
      );
    audit(userId, "create", "account", Number(lastInsertRowid), { code: input.code, name: input.name });
    return Number(lastInsertRowid);
  });
}

export function updateAccount(id: number, input: Omit<AccountInput, "code" | "parentId">, userId: number) {
  const current = getAccount(id);
  assert(current, "科目不存在");
  validate({ ...input, code: current.code, parentId: current.parent_id });
  if (current.type !== input.type && hasEntries(id)) {
    throw new AppError("科目已有分錄，不可變更科目類別");
  }
  getDb()
    .prepare(
      `UPDATE accounts SET name = ?, type = ?, category = ?, normal_balance = ?, description = ?, is_active = ? WHERE id = ?`,
    )
    .run(
      input.name.trim(),
      input.type,
      input.category,
      input.normalBalance ?? current.normal_balance,
      input.description ?? null,
      input.isActive === false ? 0 : 1,
      id,
    );
  audit(userId, "update", "account", id, input);
}

export function deleteAccount(id: number, userId: number) {
  const acc = getAccount(id);
  assert(acc, "科目不存在");
  tx((db) => {
    const child = db.prepare("SELECT 1 FROM accounts WHERE parent_id = ? LIMIT 1").get(id);
    if (child) throw new AppError("此科目仍有下層科目，無法刪除");
    if (hasEntries(id)) throw new AppError("此科目已有傳票分錄，無法刪除，請改為停用");
    const used =
      db.prepare("SELECT 1 FROM ar_invoice_lines WHERE account_id = ? LIMIT 1").get(id) ||
      db.prepare("SELECT 1 FROM ap_bill_lines WHERE account_id = ? LIMIT 1").get(id);
    if (used) throw new AppError("此科目已被應收／應付單據使用，無法刪除");
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    if (acc.parent_id) {
      const siblings = db.prepare("SELECT COUNT(*) c FROM accounts WHERE parent_id = ?").get(acc.parent_id) as { c: number };
      if (siblings.c === 0) db.prepare("UPDATE accounts SET is_detail = 1 WHERE id = ?").run(acc.parent_id);
    }
    audit(userId, "delete", "account", id, { code: acc.code, name: acc.name });
  });
}
