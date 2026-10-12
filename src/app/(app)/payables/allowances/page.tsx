import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listApAllowances } from "@/lib/services/payables";
import { startOfYear, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { ActionButton } from "@/components/forms";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/ui";
import { voidApAllowanceAction } from "../actions";

export const metadata = { title: "進貨折讓" };

export default async function AllowancesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("ap.view");
  const sp = await searchParams;
  const from = sp.from || startOfYear(today());
  const to = sp.to || today();
  const rows = listApAllowances({ from, to });
  const active = rows.filter((r) => r.status === "active");
  const canManage = user.permissions.has("ap.manage");

  return (
    <>
      <PageHeader title="進貨折讓" description="折讓單請於原單據明細頁開立；折讓會沖減未結餘額，並列入營業稅媒體申報。" />
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
        <table className="table">
          <thead>
            <tr>
              <th>折讓單號</th>
              <th>日期</th>
              <th>原單據</th>
              <th>原憑證號碼</th>
              <th>供應商</th>
              <th>原因</th>
              <th className="num">折讓金額（未稅）</th>
              <th className="num">稅額</th>
              <th>傳票</th>
              <th>狀態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={11} />}
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "void" ? "text-slate-400 line-through" : ""}>
                <td className="font-mono">{r.allowance_no}</td>
                <td className="whitespace-nowrap">{r.allowance_date}</td>
                <td>
                  <Link href={`/payables/${r.bill_id}`} className="link font-mono">
                    {r.bill_no}
                  </Link>
                </td>
                <td className="font-mono">{r.vendor_ref}</td>
                <td>{r.vendor_name}</td>
                <td>{r.reason}</td>
                <td className="num">{formatMoney(r.amount)}</td>
                <td className="num">{formatMoney(r.tax_amount)}</td>
                <td>
                  {r.voucher_id && (
                    <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">
                      {r.voucher_no}
                    </Link>
                  )}
                </td>
                <td>{r.status === "void" ? <Badge>已作廢</Badge> : <Badge color="green">有效</Badge>}</td>
                <td>
                  {canManage && r.status === "active" && (
                    <ActionButton action={voidApAllowanceAction} fields={{ id: r.id }} label="作廢" size="sm" variant="danger" promptReason={`請輸入折讓單 ${r.allowance_no} 之作廢原因`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>有效折讓 {active.length} 張</td>
              <td className="num">{formatMoney(active.reduce((s, r) => s + r.amount, 0))}</td>
              <td className="num">{formatMoney(active.reduce((s, r) => s + r.tax_amount, 0))}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
