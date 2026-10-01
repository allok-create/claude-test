import { requirePermission } from "@/lib/auth/session";
import { getBalanceSheet, type StatementSection } from "@/lib/services/reports";
import { getCompanyInfo } from "@/lib/services/settings";
import { isValidDate, toRocDate, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Badge, Card, PageHeader, ReportTitle } from "@/components/ui";

export const metadata = { title: "資產負債表" };

function SectionRows({ section }: { section: StatementSection }) {
  return (
    <>
      <tr className="font-semibold">
        <td colSpan={2}>{section.title}</td>
      </tr>
      {section.lines.length === 0 && (
        <tr>
          <td className="pl-8 text-slate-400">（無）</td>
          <td></td>
        </tr>
      )}
      {section.lines.map((l, i) => (
        <tr key={`${l.code}-${i}`}>
          <td className="pl-8">
            {l.code && <span className="font-mono text-slate-500">{l.code}</span>} {l.name}
          </td>
          <td className="num">{formatMoney(l.amount)}</td>
        </tr>
      ))}
      <tr className="border-t border-slate-200">
        <td className="pl-4 font-medium">{section.title}合計</td>
        <td className="num font-medium">{formatMoney(section.total)}</td>
      </tr>
    </>
  );
}

function TotalRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <tr className={strong ? "border-y-2 border-slate-400 bg-slate-50 text-base font-bold" : "bg-slate-50/60 font-semibold"}>
      <td>{label}</td>
      <td className="num">{formatMoney(amount)}</td>
    </tr>
  );
}

function Head() {
  return (
    <thead>
      <tr>
        <th>會計項目</th>
        <th className="num">金額</th>
      </tr>
    </thead>
  );
}

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const asOf = isValidDate(sp.asOf) ? sp.asOf : today();
  const bs = getBalanceSheet(asOf);
  const company = getCompanyInfo();

  return (
    <>
      <PageHeader
        title="資產負債表"
        description="截至指定日期之資產、負債及權益餘額；尚未結轉之損益列於權益項下。"
        actions={<PrintButton />}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">截止日期</span>
            <input type="date" name="asOf" defaultValue={asOf} className="input" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <div className="p-4">
          <ReportTitle company={company.name} title="資產負債表" period={`中華民國 ${toRocDate(asOf)}`} />
          <div className="mb-3 text-center print:hidden">
            {bs.balanced ? (
              <Badge color="green">資產 = 負債 + 權益，借貸平衡</Badge>
            ) : (
              <Badge color="red">不平衡：差額 {formatMoney(bs.totalAssets - bs.totalLiabilitiesAndEquity)}</Badge>
            )}
          </div>
          <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
            <div>
              <table className="table">
                <Head />
                <tbody>
                  <tr className="text-base font-bold">
                    <td colSpan={2}>資產</td>
                  </tr>
                  <SectionRows section={bs.currentAssets} />
                  <SectionRows section={bs.nonCurrentAssets} />
                  <TotalRow label="資產總計" amount={bs.totalAssets} strong />
                </tbody>
              </table>
            </div>
            <div>
              <table className="table">
                <Head />
                <tbody>
                  <tr className="text-base font-bold">
                    <td colSpan={2}>負債</td>
                  </tr>
                  <SectionRows section={bs.currentLiabilities} />
                  <SectionRows section={bs.nonCurrentLiabilities} />
                  <TotalRow label="負債總計" amount={bs.totalLiabilities} />
                  <tr className="text-base font-bold">
                    <td colSpan={2}>權益</td>
                  </tr>
                  <SectionRows section={bs.equity} />
                  <TotalRow label="負債及權益總計" amount={bs.totalLiabilitiesAndEquity} strong />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
