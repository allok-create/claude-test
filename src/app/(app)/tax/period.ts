import { addDays, today } from "@/lib/utils/date";
import { vatPeriodLabel, vatPeriodOf, vatPeriodRange } from "@/lib/services/vat-lock";

/** 預設期別：今日所屬期別之前一期（每單月 15 日前申報上兩個月） */
export function defaultPeriod(): string {
  return vatPeriodOf(addDays(vatPeriodRange(vatPeriodOf(today())).from, -1));
}

/** 最近 12 期 */
export function recentPeriods(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  let p = vatPeriodOf(today());
  for (let i = 0; i < 12; i++) {
    out.push({ value: p, label: vatPeriodLabel(p) });
    p = vatPeriodOf(addDays(vatPeriodRange(p).from, -1));
  }
  return out;
}

export function validPeriod(p: string | undefined): string {
  return p && /^\d{4}-(01|03|05|07|09|11)$/.test(p) ? p : defaultPeriod();
}
