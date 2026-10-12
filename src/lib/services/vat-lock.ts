import { getDb } from "../db";
import { AppError } from "../utils/errors";

/** 營業稅申報期別：每兩個月一期，以起始月（奇數月）YYYY-MM 表示 */
export function vatPeriodOf(date: string): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  const start = m % 2 === 0 ? m - 1 : m;
  return `${y}-${String(start).padStart(2, "0")}`;
}

/** 期別之起訖日 */
export function vatPeriodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const endMonth = m + 1;
  const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${y}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

/** 期別顯示：民國 115 年 9–10 月 */
export function vatPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `民國 ${y - 1911} 年 ${m}–${m + 1} 月`;
}

/** 已完成營業稅申報之期別，不得再新增或作廢該期之發票、折讓單 */
export function assertVatPeriodOpen(date: string) {
  const period = vatPeriodOf(date);
  const filed = getDb().prepare("SELECT 1 FROM vat_filings WHERE period = ?").get(period);
  if (filed) throw new AppError(`${vatPeriodLabel(period)}營業稅已申報，不得異動該期發票或折讓單；如需更正請先取消該期申報`);
}
