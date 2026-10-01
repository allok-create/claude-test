import { getDb } from "../db";

/**
 * 產生單據編號：<前綴><期間><流水號>
 * 例：傳票 20261001-0001、應收 AR202610-0001
 */
export function nextNumber(prefix: string, period: string, width = 4): string {
  const db = getDb();
  const name = `${prefix}:${period}`;
  db.prepare(
    "INSERT INTO sequences (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1",
  ).run(name);
  const { value } = db.prepare("SELECT value FROM sequences WHERE name = ?").get(name) as { value: number };
  return `${prefix}${period}-${String(value).padStart(width, "0")}`;
}
