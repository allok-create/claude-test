import type Database from "better-sqlite3";
import { DEFAULT_ROLES } from "../auth/permissions";
import { hashPassword } from "../auth/password";
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_MAPPINGS } from "./chart-of-accounts";

export const DEFAULT_SETTINGS: Record<string, string> = {
  "company.name": "範例股份有限公司",
  "company.tax_id": "12345678",
  "company.address": "台中市北屯區文心路四段955號20樓之5",
  "company.phone": "04-22410032",
  "company.owner": "",
  "posting.auto": "1", // 傳票儲存後自動過帳
  "posting.closing_date": "", // 關帳日（含）以前不得異動
  "tax.default_rate": "0.05",
  ...DEFAULT_ACCOUNT_MAPPINGS,
};

/**
 * 建立系統運作所需的基本資料（冪等）：
 * 系統設定、預設角色與權限、管理員帳號、預設會計科目表。
 */
export function seedBaseData(db: Database.Database) {
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  const hasRoles = (db.prepare("SELECT COUNT(*) c FROM roles").get() as { c: number }).c > 0;
  const hasAccounts = (db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number }).c > 0;

  db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

    if (!hasRoles) {
      const insertRole = db.prepare(
        "INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 1)",
      );
      const insertPerm = db.prepare("INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)");
      for (const role of DEFAULT_ROLES) {
        const { lastInsertRowid } = insertRole.run(role.code, role.name, role.description);
        for (const p of role.permissions) insertPerm.run(lastInsertRowid, p);
      }
      const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get() as { id: number };
      db.prepare(
        "INSERT INTO users (username, display_name, password_hash, role_id) VALUES (?, ?, ?, ?)",
      ).run("admin", "系統管理員", hashPassword(process.env.ADMIN_PASSWORD || "admin123"), adminRole.id);
    }

    if (!hasAccounts) {
      const childCount = new Map<string, number>();
      for (const [, , , , parent] of DEFAULT_ACCOUNTS) {
        if (parent) childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
      }
      const ids = new Map<string, { id: number; level: number }>();
      const insert = db.prepare(`INSERT INTO accounts
        (code, name, type, category, normal_balance, parent_id, level, is_detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const [code, name, type, category, parent] of DEFAULT_ACCOUNTS) {
        const p = parent ? ids.get(parent) : undefined;
        const level = p ? p.level + 1 : 1;
        const normal = normalBalanceFor(type, code);
        const { lastInsertRowid } = insert.run(
          code,
          name,
          type,
          category,
          normal,
          p?.id ?? null,
          level,
          childCount.has(code) ? 0 : 1,
        );
        ids.set(code, { id: Number(lastInsertRowid), level });
      }
    }
  })();
}

/** 依科目類別決定正常餘額方向；備抵、累計折舊、銷貨退回折讓為抵銷科目 */
export function normalBalanceFor(type: string, code = ""): "debit" | "credit" {
  const contra = ["1180", "1690", "4170", "4190"];
  const base = type === "asset" || type === "expense" ? "debit" : "credit";
  if (contra.includes(code)) return base === "debit" ? "credit" : "debit";
  return base;
}
