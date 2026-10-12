import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { collectVatRecords, formatRecord, getFilerInfo, vatPeriodLabel, type VatRecord } from "@/lib/services/vat";
import { formatLabel, TAX_TYPE_LABELS } from "@/lib/vat-codes";
import { formatMoney } from "@/lib/utils/money";
import { Alert, Card, EmptyRow, PageHeader } from "@/components/ui";
import { recentPeriods, validPeriod } from "../period";

export const metadata = { title: "進銷項媒體資料" };

const SOURCE_HREF: Record<VatRecord["source"], (id: number) => string> = {
  ar_invoice: (id) => `/receivables/${id}`,
  ap_bill: (id) => `/payables/${id}`,
  ar_allowance: () => "/receivables/allowances",
  ap_allowance: () => "/payables/allowances",
};

const ALLOWANCE_LABELS: Record<string, string> = {
  "23": "23 進貨退出或折讓（三聯式／電子發票）",
  "24": "24 進貨退出或折讓（二聯式／其他憑證）",
  "33": "33 銷貨退回或折讓（三聯式／電子發票）",
  "34": "34 銷貨退回或折讓（二聯式）",
};

export default async function TaxRecordsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requirePermission("tax.view");
  const period = validPeriod((await searchParams).period);
  const filer = getFilerInfo();
  const { records, problems } = collectVatRecords(period);
  const canFormat = filer.errors.length === 0;

  return (
    <>
      <PageHeader
        title="進銷項媒體資料"
        description={`${vatPeriodLabel(period)}：每筆資料依「營業人進、銷項資料檔」格式組成 81 字元，依格式代號排序並編列流水號。`}
        actions={
          <Link href={`/tax?period=${period}`} className="btn">
            返回 401 申報書
          </Link>
        }
      />
      <Card bodyClassName="p-3" className="mb-4">
        <form className="flex flex-wrap items-end gap-2">
          <label>
            <span className="label">申報期別</span>
            <select name="period" defaultValue={period} className="input">
              {recentPeriods().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">查詢</button>
          <span className="ml-auto text-sm text-slate-500">
            共 {records.length} 筆{problems.length > 0 && <span className="text-rose-600">，另有 {problems.length} 筆資料不完整未列入</span>}
          </span>
        </form>
      </Card>
      {!canFormat && <Alert tone="warn">{filer.errors.join("；")}，媒體檔原始內容暫無法顯示。</Alert>}

      <Card bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>流水號</th>
              <th>格式代號</th>
              <th>日期</th>
              <th>來源單據</th>
              <th>對象</th>
              <th>買受人</th>
              <th>銷售人</th>
              <th>憑證號碼</th>
              <th className="num">金額</th>
              <th>課稅別</th>
              <th className="num">稅額</th>
              <th>扣抵</th>
              <th>通關</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && <EmptyRow colSpan={13} message="本期無進銷項資料" />}
            {records.map((r, i) => (
              <tr key={`${r.source}${r.sourceId}`}>
                <td className="font-mono text-xs">{String(i + 1).padStart(7, "0")}</td>
                <td className="text-xs">{ALLOWANCE_LABELS[r.formatCode] ?? formatLabel(r.formatCode)}</td>
                <td className="whitespace-nowrap">{r.date}</td>
                <td>
                  <Link href={SOURCE_HREF[r.source](r.sourceId)} className="link font-mono text-xs">
                    {r.sourceNo}
                  </Link>
                </td>
                <td className="text-xs">{r.partnerName}</td>
                <td className="font-mono text-xs">{r.buyerId}</td>
                <td className="font-mono text-xs">{r.sellerId}</td>
                <td className="font-mono text-xs">{r.docNo}</td>
                <td className="num">{formatMoney(r.amount)}</td>
                <td>{TAX_TYPE_LABELS[r.taxType]}</td>
                <td className="num">{formatMoney(r.tax)}</td>
                <td className="text-center">{r.deductionCode}</td>
                <td className="text-center">{r.customsMark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canFormat && records.length > 0 && (
        <Card title="媒體檔原始內容" className="mt-4" bodyClassName="overflow-x-auto p-4">
          <pre className="font-mono text-xs leading-5 whitespace-pre text-slate-700">
            {"         1         2         3         4         5         6         7         8\n"}
            {"123456789012345678901234567890123456789012345678901234567890123456789012345678901\n"}
            {records.map((r, i) => formatRecord(r, filer.taxRegNo, i + 1)).join("\n")}
          </pre>
        </Card>
      )}
    </>
  );
}
