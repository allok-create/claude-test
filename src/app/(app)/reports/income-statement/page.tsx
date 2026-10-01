import { requirePermission } from "@/lib/auth/session";
import { getIncomeStatement, type StatementSection } from "@/lib/services/reports";
import { getCompanyInfo } from "@/lib/services/settings";
import { startOfYear, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Card, PageHeader, ReportTitle } from "@/components/ui";
import { periodLabel, resolvePeriod } from "@/app/(app)/ledger/shared";

export const metadata = { title: "損益表" };

function pct(amount: number, base: number) {
  if (!base) return "";
  const p = (amount / base) * 100;
  return `${p < 0 ? "(" : ""}${Math.abs(p).toFixed(2)}${p < 0 ? ")" : ""}%`;
}

export default async function IncomeStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.from, sp.to, startOfYear(today()), today());
  const is = getIncomeStatement(from, to);
  const company = getCompanyInfo();
  const base = is.revenue.total;

  const Section = ({ section }: { section: StatementSection }) => (
    <>
      <tr className="font-semibold">
        <td colSpan={3}>{section.title}</td>
      </tr>
      {section.lines.length === 0 && (
        <tr>
          <td className="pl-8 text-slate-400">（無）</td>
          <td></td>
          <td></td>
        </tr>
      )}
      {section.lines.map((l) => (
        <tr key={l.code}>
          <td className="pl-8">
            <span className="font-mono text-slate-500">{l.code}</span> {l.name}
          </td>
          <td className="num">{formatMoney(l.amount)}</td>
          <td className="num text-slate-500">{pct(l.amount, base)}</td>
        </tr>
      ))}
      <tr className="border-t border-slate-200">
        <td className="pl-4 font-medium">{section.title}合計</td>
        <td className="num font-medium">{formatMoney(section.total)}</td>
        <td className="num text-slate-500">{pct(section.total, base)}</td>
      </tr>
    </>
  );

  const Subtotal = ({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) => (
    <tr className={strong ? "border-y-2 border-slate-400 bg-slate-50 text-base font-bold" : "bg-slate-50/60 font-semibold"}>
      <td>{label}</td>
      <td className="num">{formatMoney(amount)}</td>
      <td className="num">{pct(amount, base)}</td>
    </tr>
  );

  return (
    <>
      <PageHeader title="損益表" description="多站式損益表；百分比為占營業收入淨額之比率。" actions={<PrintButton />} />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">起日</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label>
            <span className="label">迄日</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <div className="mx-auto max-w-3xl p-4">
          <ReportTitle company={company.name} title="損益表" period={periodLabel(from, to)} />
          <table className="table">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num">金額</th>
                <th className="num w-24">%</th>
              </tr>
            </thead>
            <tbody>
              <Section section={is.revenue} />
              <Section section={is.cost} />
              <Subtotal label="營業毛利" amount={is.grossProfit} />
              <Section section={is.operatingExpense} />
              <Subtotal label="營業淨利" amount={is.operatingIncome} />
              <Section section={is.nonOperatingRevenue} />
              <Section section={is.nonOperatingExpense} />
              <Subtotal label="稅前淨利" amount={is.incomeBeforeTax} />
              <Section section={is.incomeTax} />
              <Subtotal label="本期淨利" amount={is.netIncome} strong />
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
