import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./schema";
import { seedBaseData } from "./seed";

export type DB = Database.Database;

const globalForDb = globalThis as unknown as { __accountingDb?: DB };

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured === ":memory:") return configured;
  const file = configured || path.join(process.cwd(), "data", "accounting.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function migrate(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(m.id, m.name);
    })();
  }
}

export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  seedBaseData(db);
  return db;
}

/** 取得共用資料庫連線（開發模式熱重載時重複使用同一連線） */
export function getDb(): DB {
  if (!globalForDb.__accountingDb) {
    globalForDb.__accountingDb = openDatabase(resolveDbPath());
  }
  return globalForDb.__accountingDb;
}

/** 測試用：以全新的記憶體資料庫取代目前連線 */
export function resetDbForTests(): DB {
  globalForDb.__accountingDb?.close();
  globalForDb.__accountingDb = openDatabase(":memory:");
  return globalForDb.__accountingDb;
}

/** 以交易執行；發生例外時自動回滾 */
export function tx<T>(fn: (db: DB) => T): T {
  const db = getDb();
  return db.transaction(() => fn(db))();
}
