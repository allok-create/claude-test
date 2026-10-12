import type Database from "better-sqlite3";
import { DEFAULT_ROLES, LATER_PERMISSION_GRANTS } from "../auth/permissions";
import { hashPassword } from "../auth/password";
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNT_MAPPINGS } from "./chart-of-accounts";

export const DEFAULT_SETTINGS: Record<string, string> = {
  "company.name": "範例股份有限公司",
  "company.tax_id": "12345678",
  "company.address": "台中市北屯區文心路四段955號20樓之5",
  "company.phone": "04-22410032",
  "company.owner": "",
  "company.tax_reg_no": "", // 稅籍編號（9 碼），媒體申報用
  "tax.opening_credit": "0", // 系統啟用前之累積留抵稅額（分）
  "posting.auto": "1", // 傳票儲存後自動過帳
  "posting.closing_date": "", // 關帳日（含）以前不得異動
  ...DEFAULT_ACCOUNT_MAPPINGS,
};

/** 初版之後才加入預設科目表的科目 */
const LATER_ADDED_ACCOUNTS = ["5190"];

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

    // 後續版本新增之權限：既有資料庫一次性授予（新資料庫之角色已含全部預設權限）
    for (const { marker, grants } of LATER_PERMISSION_GRANTS) {
      if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(marker)) continue;
      db.prepare("INSERT INTO settings (key, value) VALUES (?, '1')").run(marker);
      if (!hasRoles) continue;
      for (const [code, perms] of Object.entries(grants)) {
        const role = db.prepare("SELECT id FROM roles WHERE code = ?").get(code) as { id: number } | undefined;
        if (!role) continue;
        for (const perm of perms) db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)").run(role.id, perm);
      }
    }

    // 後續版本新增之預設科目：僅於既有資料庫補建一次（使用者刪除後不再重建）
    for (const [code, name, type, category, parent] of DEFAULT_ACCOUNTS) {
      if (!LATER_ADDED_ACCOUNTS.includes(code)) continue;
      const marker = `seed.account.${code}`;
      if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(marker)) continue;
      db.prepare("INSERT INTO settings (key, value) VALUES (?, '1')").run(marker);
      if (db.prepare("SELECT 1 FROM accounts WHERE code = ?").get(code)) continue;
      const p = parent
        ? (db.prepare("SELECT id, level, is_detail FROM accounts WHERE code = ?").get(parent) as { id: number; level: number; is_detail: number } | undefined)
        : undefined;
      if (parent && (!p || p.is_detail)) continue; // 上層不存在或已被改為明細科目時不補建
      db.prepare(
        `INSERT INTO accounts (code, name, type, category, normal_balance, parent_id, level, is_detail) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run(code, name, type, category, normalBalanceFor(type, code), p?.id ?? null, p ? p.level + 1 : 1);
    }
  })();
}

/** 依科目類別決定正常餘額方向；備抵、累計折舊、銷貨退回折讓為抵銷科目 */
export function normalBalanceFor(type: string, code = ""): "debit" | "credit" {
  const contra = ["1180", "1690", "4170", "4190", "5190"];
  const base = type === "asset" || type === "expense" ? "debit" : "credit";
  if (contra.includes(code)) return base === "debit" ? "credit" : "debit";
  return base;
}
