import { getDb } from "../db";
import type { Account } from "./accounts";
import { addDays, startOfYear } from "../utils/date";

/**
 * 財務報表：試算表、損益表、資產負債表。
 */

type Movement = { account_id: number; opening: number; debit: number; credit: number };

function getMovements(from: string, to: string): Map<number, Movement> {
  const rows = getDb()
    .prepare(
      `SELECT account_id,
         SUM(CASE WHEN entry_date < ? THEN debit - credit ELSE 0 END) opening,
         SUM(CASE WHEN entry_date >= ? THEN debit ELSE 0 END) debit,
         SUM(CASE WHEN entry_date >= ? THEN credit ELSE 0 END) credit
       FROM gl_entries WHERE entry_date <= ?
       GROUP BY account_id`,
    )
    .all(from, from, from, to) as Movement[];
  return new Map(rows.map((r) => [r.account_id, r]));
}

export type TrialBalanceRow = {
  account: Account;
  opening: number; // 借方為正
  debit: number;
  credit: number;
  closing: number; // 借方為正
};

export type TrialBalance = {
  rows: TrialBalanceRow[];
  totals: { openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number };
  balanced: boolean;
};

/**
 * 試算表：列示各科目期初餘額、本期借貸發生額及期末餘額。
 * 上層科目金額為下層科目彙總；合計僅計算明細科目以免重複。
 */
export function getTrialBalance(from: string, to: string, opts: { maxLevel?: number; includeZero?: boolean } = {}): TrialBalance {
  const accounts = getDb().prepare("SELECT * FROM accounts ORDER BY code").all() as Account[];
  const movements = getMovements(from, to);
  const agg = new Map<number, { opening: number; debit: number; credit: number }>();
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const a of accounts) agg.set(a.id, { opening: 0, debit: 0, credit: 0 });
  for (const [accountId, m] of movements) {
    // 往上層累加
    let cur: Account | undefined = byId.get(accountId);
    while (cur) {
      const t = agg.get(cur.id)!;
      t.opening += m.opening;
      t.debit += m.debit;
      t.credit += m.credit;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  }

  const totals = { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 };
  const rows: TrialBalanceRow[] = [];
  for (const a of accounts) {
    const t = agg.get(a.id)!;
    const closing = t.opening + t.debit - t.credit;
    if (a.is_detail) {
      if (t.opening > 0) totals.openingDebit += t.opening;
      else totals.openingCredit -= t.opening;
      totals.debit += t.debit;
      totals.credit += t.credit;
      if (closing > 0) totals.closingDebit += closing;
      else totals.closingCredit -= closing;
    }
    if (opts.maxLevel && a.level > opts.maxLevel) continue;
    if (!opts.includeZero && t.opening === 0 && t.debit === 0 && t.credit === 0) continue;
    rows.push({ account: a, opening: t.opening, debit: t.debit, credit: t.credit, closing });
  }
  return {
    rows,
    totals,
    balanced: totals.debit === totals.credit && totals.closingDebit === totals.closingCredit,
  };
}

/** 各明細科目於期間內之淨發生額（借方為正） */
function periodNet(from: string, to: string): Map<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT account_id, SUM(debit - credit) net FROM gl_entries
       WHERE entry_date BETWEEN ? AND ? GROUP BY account_id`,
    )
    .all(from, to) as { account_id: number; net: number }[];
  return new Map(rows.map((r) => [r.account_id, r.net]));
}

export type StatementLine = { code: string; name: string; amount: number };
export type StatementSection = { key: string; title: string; lines: StatementLine[]; total: number };

function buildSection(
  key: string,
  title: string,
  accounts: Account[],
  net: Map<number, number>,
  filter: (a: Account) => boolean,
  sign: 1 | -1,
): StatementSection {
  const lines: StatementLine[] = [];
  for (const a of accounts) {
    if (!a.is_detail || !filter(a)) continue;
    const amount = (net.get(a.id) ?? 0) * sign;
    if (amount !== 0) lines.push({ code: a.code, name: a.name, amount });
  }
  return { key, title, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

export type IncomeStatement = {
  from: string;
  to: string;
  revenue: StatementSection;
  cost: StatementSection;
  grossProfit: number;
  operatingExpense: StatementSection;
  operatingIncome: number;
  nonOperatingRevenue: StatementSection;
  nonOperatingExpense: StatementSection;
  incomeBeforeTax: number;
  incomeTax: StatementSection;
  netIncome: number;
};

/** 損益表（多站式） */
export function getIncomeStatement(from: string, to: string): IncomeStatement {
  const accounts = getDb().prepare("SELECT * FROM accounts ORDER BY code").all() as Account[];
  const net = periodNet(from, to);
  // 收益類以貸方為正；費損類以借方為正
  const revenue = buildSection("revenue", "營業收入", accounts, net, (a) => a.category === "operating_revenue", -1);
  const cost = buildSection("cost", "營業成本", accounts, net, (a) => a.category === "cost_of_sales", 1);
  const operatingExpense = buildSection("opex", "營業費用", accounts, net, (a) => a.category === "operating_expense", 1);
  const nonOperatingRevenue = buildSection(
    "nonOpRev",
    "營業外收益",
    accounts,
    net,
    (a) => a.type === "revenue" && a.category !== "operating_revenue",
    -1,
  );
  const nonOperatingExpense = buildSection(
    "nonOpExp",
    "營業外費損",
    accounts,
    net,
    (a) => a.type === "expense" && !["cost_of_sales", "operating_expense", "income_tax"].includes(a.category),
    1,
  );
  const incomeTax = buildSection("tax", "所得稅費用", accounts, net, (a) => a.category === "income_tax", 1);
  const grossProfit = revenue.total - cost.total;
  const operatingIncome = grossProfit - operatingExpense.total;
  const incomeBeforeTax = operatingIncome + nonOperatingRevenue.total - nonOperatingExpense.total;
  return {
    from,
    to,
    revenue,
    cost,
    grossProfit,
    operatingExpense,
    operatingIncome,
    nonOperatingRevenue,
    nonOperatingExpense,
    incomeBeforeTax,
    incomeTax,
    netIncome: incomeBeforeTax - incomeTax.total,
  };
}

/** 期間淨利（收益 - 費損） */
export function getNetIncome(from: string, to: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(g.credit - g.debit), 0) ni FROM gl_entries g
       JOIN accounts a ON a.id = g.account_id
       WHERE a.type IN ('revenue','expense') AND g.entry_date BETWEEN ? AND ?`,
    )
    .get(from, to) as { ni: number };
  return row.ni;
}

export type BalanceSheet = {
  asOf: string;
  currentAssets: StatementSection;
  nonCurrentAssets: StatementSection;
  totalAssets: number;
  currentLiabilities: StatementSection;
  nonCurrentLiabilities: StatementSection;
  totalLiabilities: number;
  equity: StatementSection;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
};

/**
 * 資產負債表：截至 asOf 之各科目餘額。
 * 尚未結轉之損益：以前年度累積損益併入「累積盈虧（未結轉）」，本年度損益列為「本期損益」。
 */
export function getBalanceSheet(asOf: string): BalanceSheet {
  const accounts = getDb().prepare("SELECT * FROM accounts ORDER BY code").all() as Account[];
  const net = periodNet("0000-01-01", asOf);
  const currentAssets = buildSection("ca", "流動資產", accounts, net, (a) => a.category === "current_asset", 1);
  const nonCurrentAssets = buildSection("nca", "非流動資產", accounts, net, (a) => a.category === "non_current_asset", 1);
  const currentLiabilities = buildSection("cl", "流動負債", accounts, net, (a) => a.category === "current_liability", -1);
  const nonCurrentLiabilities = buildSection(
    "ncl",
    "非流動負債",
    accounts,
    net,
    (a) => a.category === "non_current_liability",
    -1,
  );
  const equity = buildSection("eq", "權益", accounts, net, (a) => a.type === "equity", -1);

  const yearStart = startOfYear(asOf);
  const priorPL = getNetIncome("0000-01-01", addDays(yearStart, -1));
  const currentPL = getNetIncome(yearStart, asOf);
  if (priorPL !== 0) {
    equity.lines.push({ code: "", name: "累積盈虧（以前年度未結轉）", amount: priorPL });
  }
  if (currentPL !== 0) {
    equity.lines.push({ code: "", name: "本期損益", amount: currentPL });
  }
  equity.total = equity.lines.reduce((s, l) => s + l.amount, 0);

  const totalAssets = currentAssets.total + nonCurrentAssets.total;
  const totalLiabilities = currentLiabilities.total + nonCurrentLiabilities.total;
  const totalLiabilitiesAndEquity = totalLiabilities + equity.total;
  return {
    asOf,
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilities,
    equity,
    totalEquity: equity.total,
    totalLiabilitiesAndEquity,
    balanced: totalAssets === totalLiabilitiesAndEquity,
  };
}

/** 單一科目（含下層）截至某日之餘額，借方為正 */
export function getBalanceByCodePrefix(prefix: string, asOf: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(g.debit - g.credit), 0) bal FROM gl_entries g
       JOIN accounts a ON a.id = g.account_id
       WHERE a.code LIKE ? AND g.entry_date <= ?`,
    )
    .get(`${prefix}%`, asOf) as { bal: number };
  return row.bal;
}
