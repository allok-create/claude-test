import { getDb } from "../db";
import type { Account } from "./accounts";

/**
 * 帳簿查詢：日記簿、總分類帳、明細分類帳。
 * 所有資料皆來自已過帳之總帳分錄（gl_entries）。
 * 餘額以「借方為正」計算，顯示時再依科目正常餘額方向轉換。
 */

export type JournalEntry = {
  id: number;
  voucher_id: number;
  voucher_no: string;
  voucher_type: string;
  entry_date: string;
  voucher_description: string | null;
  account_code: string;
  account_name: string;
  description: string | null;
  debit: number;
  credit: number;
  partner_name: string | null;
};

const PARTNER_NAME_SQL = `CASE g.partner_type WHEN 'customer' THEN c.name WHEN 'vendor' THEN ve.name END`;
const PARTNER_JOIN_SQL = `LEFT JOIN customers c ON g.partner_type = 'customer' AND c.id = g.partner_id
  LEFT JOIN vendors ve ON g.partner_type = 'vendor' AND ve.id = g.partner_id`;

/** 日記簿：依日期、傳票順序列出所有已過帳分錄 */
export function getJournal(from: string, to: string): JournalEntry[] {
  return getDb()
    .prepare(
      `SELECT g.id, g.voucher_id, v.voucher_no, v.voucher_type, g.entry_date, v.description voucher_description,
         a.code account_code, a.name account_name, g.description, g.debit, g.credit, ${PARTNER_NAME_SQL} partner_name
       FROM gl_entries g
       JOIN vouchers v ON v.id = g.voucher_id
       JOIN accounts a ON a.id = g.account_id
       ${PARTNER_JOIN_SQL}
       WHERE g.entry_date BETWEEN ? AND ?
       ORDER BY g.entry_date, v.voucher_no, g.id`,
    )
    .all(from, to) as JournalEntry[];
}

/** 取得科目及其所有下層科目 ID */
export function getAccountSubtreeIds(accountId: number): number[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM accounts WHERE id = ?
         UNION ALL
         SELECT a.id FROM accounts a JOIN tree t ON a.parent_id = t.id
       ) SELECT id FROM tree`,
    )
    .all(accountId) as { id: number }[];
  return rows.map((r) => r.id);
}

type PartnerFilter = { partnerType?: "customer" | "vendor"; partnerId?: number };

function partnerWhere(p: PartnerFilter, params: unknown[]): string {
  if (p.partnerType && p.partnerId) {
    params.push(p.partnerType, p.partnerId);
    return " AND g.partner_type = ? AND g.partner_id = ?";
  }
  return "";
}

/** 期初餘額（from 之前所有已過帳分錄，借方為正） */
export function getOpeningBalance(accountIds: number[], before: string, partner: PartnerFilter = {}): number {
  if (accountIds.length === 0) return 0;
  const params: unknown[] = [...accountIds, before];
  const extra = partnerWhere(partner, params);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(g.debit - g.credit), 0) bal FROM gl_entries g
       WHERE g.account_id IN (${accountIds.map(() => "?").join(",")}) AND g.entry_date < ?${extra}`,
    )
    .get(...params) as { bal: number };
  return row.bal;
}

export type LedgerRow = {
  entry_date: string;
  voucher_id: number;
  voucher_no: string;
  account_code: string;
  account_name: string;
  description: string | null;
  partner_name: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type LedgerResult = {
  account: Account;
  opening: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
};

/**
 * 明細分類帳：逐筆列示某科目（含下層）之分錄與累計餘額，可依客戶／供應商篩選。
 */
export function getSubsidiaryLedger(accountId: number, from: string, to: string, partner: PartnerFilter = {}): LedgerResult | null {
  const account = getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as Account | undefined;
  if (!account) return null;
  const ids = getAccountSubtreeIds(accountId);
  const opening = getOpeningBalance(ids, from, partner);
  const params: unknown[] = [...ids, from, to];
  const extra = partnerWhere(partner, params);
  const entries = getDb()
    .prepare(
      `SELECT g.entry_date, g.voucher_id, v.voucher_no, a.code account_code, a.name account_name,
         g.description, ${PARTNER_NAME_SQL} partner_name, g.debit, g.credit
       FROM gl_entries g
       JOIN vouchers v ON v.id = g.voucher_id
       JOIN accounts a ON a.id = g.account_id
       ${PARTNER_JOIN_SQL}
       WHERE g.account_id IN (${ids.map(() => "?").join(",")}) AND g.entry_date BETWEEN ? AND ?${extra}
       ORDER BY g.entry_date, v.voucher_no, g.id`,
    )
    .all(...params) as Omit<LedgerRow, "balance">[];
  return buildLedger(account, opening, entries);
}

/**
 * 總分類帳：以傳票為單位彙總某科目（含下層）之借貸金額，並計算累計餘額。
 */
export function getGeneralLedger(accountId: number, from: string, to: string): LedgerResult | null {
  const account = getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as Account | undefined;
  if (!account) return null;
  const ids = getAccountSubtreeIds(accountId);
  const opening = getOpeningBalance(ids, from);
  const entries = getDb()
    .prepare(
      `SELECT g.entry_date, g.voucher_id, v.voucher_no, ? account_code, ? account_name,
         v.description description, NULL partner_name,
         SUM(g.debit) debit, SUM(g.credit) credit
       FROM gl_entries g
       JOIN vouchers v ON v.id = g.voucher_id
       WHERE g.account_id IN (${ids.map(() => "?").join(",")}) AND g.entry_date BETWEEN ? AND ?
       GROUP BY g.voucher_id
       ORDER BY g.entry_date, v.voucher_no`,
    )
    .all(account.code, account.name, ...ids, from, to) as Omit<LedgerRow, "balance">[];
  // 同一傳票同時有借有貸時，以淨額表示
  const netted = entries.map((e) => {
    const net = e.debit - e.credit;
    return { ...e, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
  });
  return buildLedger(account, opening, netted);
}

function buildLedger(account: Account, opening: number, entries: Omit<LedgerRow, "balance">[]): LedgerResult {
  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = entries.map((e) => {
    balance += e.debit - e.credit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, balance };
  });
  return { account, opening, rows, totalDebit, totalCredit, closing: balance };
}

/** 依正常餘額方向轉換顯示：回傳 [方向, 金額] */
export function presentBalance(balance: number): { side: "借" | "貸" | "平"; amount: number } {
  if (balance === 0) return { side: "平", amount: 0 };
  return balance > 0 ? { side: "借", amount: balance } : { side: "貸", amount: -balance };
}
