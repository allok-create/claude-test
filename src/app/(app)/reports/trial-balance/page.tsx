import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getTrialBalance } from "@/lib/services/reports";
import { getCompanyInfo } from "@/lib/services/settings";
import { startOfYear, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Badge, Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";
import { BalanceCells, periodLabel, resolvePeriod } from "@/app/(app)/ledger/shared";

export const metadata = { title: "試算表" };

type Search = { from?: string; to?: string; level?: string; zero?: string };

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.from, sp.to, startOfYear(today()), today());
  const level = ["1", "2", "3"].includes(sp.level ?? "") ? Number(sp.level) : 0;
  const includeZero = sp.zero === "1";
  const tb = getTrialBalance(from, to, { maxLevel: level || undefined, includeZero });
  const company = getCompanyInfo();
  const t = tb.totals;

  return (
    <>
      <PageHeader
        title="試算表"
        description="列示各科目期初餘額、本期借貸發生額及期末餘額；上層科目為下層彙總，合計僅計算明細科目。"
        actions={<PrintButton />}
      />
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
          <label>
            <span className="label">科目層級</span>
            <select name="level" defaultValue={level ? String(level) : ""} className="input">
              <option value="">全部</option>
              <option value="1">第一層</option>
              <option value="2">第二層以上</option>
              <option value="3">第三層以上</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" name="zero" value="1" defaultChecked={includeZero} />
            顯示零餘額科目
          </label>
          <button className="btn">查詢</button>
        </form>
        <div className="p-4">
          <ReportTitle company={company.name} title="試算表" period={periodLabel(from, to)} />
          <table className="table">
            <thead>
              <tr>
                <th rowSpan={2}>科目代碼</th>
                <th rowSpan={2}>科目名稱</th>
                <th colSpan={2} className="text-center">期初餘額</th>
                <th rowSpan={2} className="num">本期借方</th>
                <th rowSpan={2} className="num">本期貸方</th>
                <th colSpan={2} className="text-center">期末餘額</th>
              </tr>
              <tr>
                <th className="text-center">借/貸</th>
                <th className="num">金額</th>
                <th className="text-center">借/貸</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.length === 0 && <EmptyRow colSpan={8} message="期間內無任何科目餘額或發生額" />}
              {tb.rows.map((r) => (
                <tr key={r.account.id} className={r.account.is_detail ? "" : "bg-slate-50/60 font-semibold"}>
                  <td className="font-mono">{r.account.code}</td>
                  <td style={{ paddingLeft: `${(r.account.level - 1) * 1.25 + 0.75}rem` }}>
                    <Link href={`/ledger/general?account=${r.account.id}&from=${from}&to=${to}`} className="hover:underline">
                      {r.account.name}
                    </Link>
                  </td>
                  <BalanceCells balance={r.opening} />
                  <td className="num">{formatMoney(r.debit, { blankZero: true })}</td>
                  <td className="num">{formatMoney(r.credit, { blankZero: true })}</td>
                  <BalanceCells balance={r.closing} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} rowSpan={2}>
                  合計{" "}
                  {tb.balanced ? <Badge color="green">借貸平衡</Badge> : <Badge color="red">借貸不平衡</Badge>}
                </td>
                <td className="text-center text-xs text-slate-500">借</td>
                <td className="num">{formatMoney(t.openingDebit)}</td>
                <td className="num" rowSpan={2}>{formatMoney(t.debit)}</td>
                <td className="num" rowSpan={2}>{formatMoney(t.credit)}</td>
                <td className="text-center text-xs text-slate-500">借</td>
                <td className="num">{formatMoney(t.closingDebit)}</td>
              </tr>
              <tr>
                <td className="text-center text-xs text-slate-500">貸</td>
                <td className="num">{formatMoney(t.openingCredit)}</td>
                <td className="text-center text-xs text-slate-500">貸</td>
                <td className="num">{formatMoney(t.closingCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
