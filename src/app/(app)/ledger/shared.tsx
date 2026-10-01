import { presentBalance } from "@/lib/services/ledger";
import { isValidDate, toRocDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";

/** 解析期間參數：不合法時使用預設值，且起日不得晚於迄日 */
export function resolvePeriod(from: string | undefined, to: string | undefined, defFrom: string, defTo: string) {
  let f = isValidDate(from) ? from : defFrom;
  let t = isValidDate(to) ? to : defTo;
  if (f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

export function periodLabel(from: string, to: string) {
  return `中華民國 ${toRocDate(from)} 至 ${toRocDate(to)}`;
}

/** 餘額欄位：借/貸 方向 + 金額（兩個 td） */
export function BalanceCells({ balance, className = "" }: { balance: number; className?: string }) {
  const b = presentBalance(balance);
  return (
    <>
      <td className={`text-center text-xs text-slate-500 ${className}`}>{b.side}</td>
      <td className={`num ${className}`}>{formatMoney(b.amount)}</td>
    </>
  );
}
