import { getDb } from "../db";
import { startOfMonth, today } from "../utils/date";
import { getApSummary } from "./payables";
import { getArSummary } from "./receivables";
import { getBalanceByCodePrefix, getNetIncome } from "./reports";
import { countVouchersByStatus } from "./vouchers";

export function getDashboard() {
  const t = today();
  const monthStart = startOfMonth(t);
  const db = getDb();
  const monthPL = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN g.credit - g.debit END), 0) revenue,
         COALESCE(SUM(CASE WHEN a.type = 'expense' THEN g.debit - g.credit END), 0) expense
       FROM gl_entries g JOIN accounts a ON a.id = g.account_id
       WHERE g.entry_date BETWEEN ? AND ?`,
    )
    .get(monthStart, t) as { revenue: number; expense: number };
  const lowStock = db
    .prepare("SELECT id, sku, name, unit, quantity_on_hand, safety_stock FROM products WHERE is_active = 1 AND safety_stock > 0 AND quantity_on_hand <= safety_stock ORDER BY sku LIMIT 10")
    .all() as { id: number; sku: string; name: string; unit: string; quantity_on_hand: number; safety_stock: number }[];
  const recentVouchers = db
    .prepare("SELECT id, voucher_no, voucher_date, voucher_type, description, status, total_amount FROM vouchers ORDER BY id DESC LIMIT 8")
    .all() as { id: number; voucher_no: string; voucher_date: string; voucher_type: string; description: string | null; status: string; total_amount: number }[];
  return {
    today: t,
    cash: getBalanceByCodePrefix("110", t),
    ar: getArSummary(),
    ap: getApSummary(),
    month: { ...monthPL, net: monthPL.revenue - monthPL.expense },
    ytdNetIncome: getNetIncome(`${t.slice(0, 4)}-01-01`, t),
    vouchers: countVouchersByStatus(),
    lowStock,
    recentVouchers,
  };
}
