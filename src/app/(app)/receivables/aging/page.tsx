import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { AGING_LABELS, getArAging, type AgingBucket } from "@/lib/services/receivables";
import { getCompanyInfo } from "@/lib/services/settings";
import { isValidDate, toRocDate, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";

export const metadata = { title: "應收帳齡" };

const BUCKETS = Object.keys(AGING_LABELS) as AgingBucket[];

export default async function ArAgingPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  await requirePermission("ar.view");
  const sp = await searchParams;
  const asOf = sp.asOf && isValidDate(sp.asOf) ? sp.asOf : today();
  const { rows, totals, grandTotal } = getArAging(asOf);
  const company = getCompanyInfo();

  return (
    <>
      <PageHeader
        title="應收帳齡分析"
        description="依應收單到期日計算截至基準日之未收餘額逾期天數。"
        actions={<PrintButton />}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">基準日</span>
            <input type="date" name="asOf" defaultValue={asOf} className="input" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <div className="p-4">
          <ReportTitle company={company.name} title="應收帳款帳齡分析表" period={`基準日：民國 ${toRocDate(asOf)}`} />
          <table className="table">
            <thead>
              <tr>
                <th>客戶編號</th>
                <th>客戶名稱</th>
                {BUCKETS.map((b) => (
                  <th key={b} className="num">
                    {AGING_LABELS[b]}
                  </th>
                ))}
                <th className="num">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={BUCKETS.length + 3} message="基準日無未收應收帳款" />}
              {rows.map((r) => (
                <tr key={r.partnerId}>
                  <td className="font-mono">{r.partnerCode}</td>
                  <td>
                    <Link href={`/customers/${r.partnerId}`} className="link">
                      {r.partnerName}
                    </Link>
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b} className={`num ${b !== "current" && r.buckets[b] > 0 ? "text-rose-600" : ""}`}>
                      {formatMoney(r.buckets[b], { blankZero: true })}
                    </td>
                  ))}
                  <td className="num font-medium">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>合計</td>
                {BUCKETS.map((b) => (
                  <td key={b} className="num">
                    {formatMoney(totals[b])}
                  </td>
                ))}
                <td className="num">{formatMoney(grandTotal)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="text-slate-500">比率</td>
                {BUCKETS.map((b) => (
                  <td key={b} className="num text-slate-500">
                    {grandTotal ? `${((totals[b] / grandTotal) * 100).toFixed(1)}%` : "—"}
                  </td>
                ))}
                <td className="num text-slate-500">{grandTotal ? "100.0%" : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
