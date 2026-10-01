import { getDb } from "../db";
import { AppError } from "../utils/errors";

export function getSetting(key: string, fallback = ""): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function isAutoPostEnabled(): boolean {
  return getSetting("posting.auto", "1") === "1";
}

export function getClosingDate(): string {
  return getSetting("posting.closing_date", "");
}

/** 檢查日期是否落在已關帳期間 */
export function assertPeriodOpen(date: string) {
  const closing = getClosingDate();
  if (closing && date <= closing) {
    throw new AppError(`${date} 已在關帳日（${closing}）之前，不得異動帳務`);
  }
}

/** 取得系統對應科目 ID（例如 acct.ar → 應收帳款） */
export function getMappedAccountId(key: string): number {
  const code = getSetting(key);
  const row = getDb().prepare("SELECT id, is_detail FROM accounts WHERE code = ?").get(code) as
    | { id: number; is_detail: number }
    | undefined;
  if (!row) throw new AppError(`系統設定的科目（${key} = ${code}）不存在，請至系統設定調整`);
  if (!row.is_detail) throw new AppError(`系統設定的科目（${code}）不是明細科目`);
  return row.id;
}

export function getCompanyInfo() {
  const s = getAllSettings();
  return {
    name: s["company.name"] ?? "",
    taxId: s["company.tax_id"] ?? "",
    address: s["company.address"] ?? "",
    phone: s["company.phone"] ?? "",
    owner: s["company.owner"] ?? "",
  };
}
