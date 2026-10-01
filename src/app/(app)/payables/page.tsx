import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listPartners } from "@/lib/services/partners";
import { BILL_STATUS_LABELS, listBills } from "@/lib/services/payables";
import { today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { Card, EmptyRow, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "應付帳款" };

type Search = { vendorId?: string; status?: string; from?: string; to?: string };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("ap.view");
  const sp = await searchParams;
  const vendors = listPartners("vendor");
  const bills = listBills({
    vendorId: Number(sp.vendorId) || undefined,
    status: sp.status || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  });
  const now = today();
  const live = bills.filter((i) => i.status !== "void");
  const sum = (f: (i: (typeof live)[number]) => number) => live.reduce((s, i) => s + f(i), 0);
  const canManage = user.permissions.has("ap.manage");

  return (
    <>
      <PageHeader
        title="應付帳款"
        description="登錄進貨或費用帳單後自動產生傳票（商品明細入庫）；到期日以紅字標示者為逾期未付。"
        actions={
          <>
            <LinkButton href="/payables/payments">付款紀錄</LinkButton>
            <LinkButton href="/payables/aging">應付帳齡</LinkButton>
            {canManage && <LinkButton href="/payables/payments/new">付款沖帳</LinkButton>}
            {canManage && <LinkButton href="/payables/new" variant="primary">登錄應付單</LinkButton>}
          </>
        }
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">供應商</span>
            <select name="vendorId" defaultValue={sp.vendorId ?? ""} className="input w-56">
              <option value="">全部供應商</option>
              {vendors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">狀態</span>
            <select name="status" defaultValue={sp.status ?? ""} className="input">
              <option value="">全部</option>
              {Object.entries(BILL_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">起日</span>
            <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
          </label>
          <label>
            <span className="label">迄日</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>單號</th>
              <th>日期</th>
              <th>到期日</th>
              <th>供應商</th>
              <th>廠商發票號碼</th>
              <th className="num">應付總額</th>
              <th className="num">已付</th>
              <th className="num">未付</th>
              <th>狀態</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && <EmptyRow colSpan={10} />}
            {bills.map((i) => {
              const open = i.status === "open" || i.status === "partial";
              return (
                <tr key={i.id} className={i.status === "void" ? "text-slate-400 line-through" : ""}>
                  <td>
                    <Link href={`/payables/${i.id}`} className="link font-mono">
                      {i.bill_no}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{i.bill_date}</td>
                  <td className={`whitespace-nowrap ${open && i.due_date < now ? "font-semibold text-rose-600" : ""}`}>{i.due_date}</td>
                  <td>
                    <Link href={`/vendors/${i.vendor_id}`} className="hover:underline">
                      {i.vendor_name}
                    </Link>
                  </td>
                  <td className="font-mono">{i.vendor_ref}</td>
                  <td className="num">{formatMoney(i.total)}</td>
                  <td className="num">{formatMoney(i.paid_amount, { blankZero: true })}</td>
                  <td className="num">{i.status === "void" ? "" : formatMoney(i.total - i.paid_amount, { blankZero: true })}</td>
                  <td>
                    <StatusBadge status={i.status} label={BILL_STATUS_LABELS[i.status]} />
                  </td>
                  <td>
                    {i.voucher_id && (
                      <Link href={`/vouchers/${i.voucher_id}`} className="link font-mono text-xs">
                        {i.voucher_no}
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>共 {bills.length} 張（合計不含作廢）</td>
              <td className="num">{formatMoney(sum((i) => i.total))}</td>
              <td className="num">{formatMoney(sum((i) => i.paid_amount))}</td>
              <td className="num">{formatMoney(sum((i) => i.total - i.paid_amount))}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
