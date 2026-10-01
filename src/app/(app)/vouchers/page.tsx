import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import {
  listVouchers,
  VOUCHER_SOURCE_LABELS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
} from "@/lib/services/vouchers";
import { startOfMonth, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { Card, EmptyRow, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "傳票輸入" };

type Search = { from?: string; to?: string; status?: string; type?: string; q?: string };

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("vouchers.view");
  const sp = await searchParams;
  const from = sp.from ?? startOfMonth(today());
  const to = sp.to ?? today();
  const vouchers = listVouchers({ from, to, status: sp.status, type: sp.type, q: sp.q });
  const total = vouchers.filter((v) => v.status !== "void").reduce((s, v) => s + v.total_amount, 0);

  return (
    <>
      <PageHeader
        title="傳票輸入"
        description="收入、支出、轉帳傳票之新增、查詢、過帳與作廢。應收、應付與庫存單據產生之傳票會標示來源。"
        actions={user.permissions.has("vouchers.create") && <LinkButton href="/vouchers/new" variant="primary">新增傳票</LinkButton>}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3">
          <label>
            <span className="label">起日</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label>
            <span className="label">迄日</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
          <label>
            <span className="label">類別</span>
            <select name="type" defaultValue={sp.type ?? ""} className="input">
              <option value="">全部</option>
              {Object.entries(VOUCHER_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">狀態</span>
            <select name="status" defaultValue={sp.status ?? ""} className="input">
              <option value="">全部</option>
              {Object.entries(VOUCHER_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">關鍵字</span>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="傳票號碼／摘要" className="input w-44" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>傳票號碼</th>
              <th>日期</th>
              <th>類別</th>
              <th>摘要</th>
              <th>來源</th>
              <th className="num">金額</th>
              <th>狀態</th>
              <th>製單</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 && <EmptyRow colSpan={8} />}
            {vouchers.map((v) => (
              <tr key={v.id} className={v.status === "void" ? "text-slate-400 line-through" : ""}>
                <td>
                  <Link href={`/vouchers/${v.id}`} className="link font-mono">
                    {v.voucher_no}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{v.voucher_date}</td>
                <td className="whitespace-nowrap">{VOUCHER_TYPE_LABELS[v.voucher_type]}</td>
                <td className="max-w-sm truncate">{v.description}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{VOUCHER_SOURCE_LABELS[v.source] ?? v.source}</td>
                <td className="num">{formatMoney(v.total_amount)}</td>
                <td>
                  <StatusBadge status={v.status} label={VOUCHER_STATUS_LABELS[v.status]} />
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">{v.created_by_name}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>共 {vouchers.length} 張（不含作廢之金額合計）</td>
              <td className="num">{formatMoney(total)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
