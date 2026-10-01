import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listPartners } from "@/lib/services/partners";
import { DOC_STATUS_LABELS, listInvoices } from "@/lib/services/receivables";
import { today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { Card, EmptyRow, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "應收帳款" };

type Search = { customerId?: string; status?: string; from?: string; to?: string };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("ar.view");
  const sp = await searchParams;
  const customers = listPartners("customer");
  const invoices = listInvoices({
    customerId: Number(sp.customerId) || undefined,
    status: sp.status || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  });
  const now = today();
  const live = invoices.filter((i) => i.status !== "void");
  const sum = (f: (i: (typeof live)[number]) => number) => live.reduce((s, i) => s + f(i), 0);
  const canManage = user.permissions.has("ar.manage");

  return (
    <>
      <PageHeader
        title="應收帳款"
        description="銷貨開立應收單後自動產生傳票（含銷貨成本）；到期日以紅字標示者為逾期未收。"
        actions={
          <>
            <LinkButton href="/receivables/receipts">收款紀錄</LinkButton>
            <LinkButton href="/receivables/aging">應收帳齡</LinkButton>
            {canManage && <LinkButton href="/receivables/receipts/new">收款沖帳</LinkButton>}
            {canManage && <LinkButton href="/receivables/new" variant="primary">開立應收單</LinkButton>}
          </>
        }
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">客戶</span>
            <select name="customerId" defaultValue={sp.customerId ?? ""} className="input w-56">
              <option value="">全部客戶</option>
              {customers.map((c) => (
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
              {Object.entries(DOC_STATUS_LABELS).map(([v, l]) => (
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
              <th>客戶</th>
              <th>統一發票號碼</th>
              <th className="num">應收總額</th>
              <th className="num">已收</th>
              <th className="num">未收</th>
              <th>狀態</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && <EmptyRow colSpan={10} />}
            {invoices.map((i) => {
              const open = i.status === "open" || i.status === "partial";
              return (
                <tr key={i.id} className={i.status === "void" ? "text-slate-400 line-through" : ""}>
                  <td>
                    <Link href={`/receivables/${i.id}`} className="link font-mono">
                      {i.invoice_no}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{i.invoice_date}</td>
                  <td className={`whitespace-nowrap ${open && i.due_date < now ? "font-semibold text-rose-600" : ""}`}>{i.due_date}</td>
                  <td>
                    <Link href={`/customers/${i.customer_id}`} className="hover:underline">
                      {i.customer_name}
                    </Link>
                  </td>
                  <td className="font-mono">{i.gui_no}</td>
                  <td className="num">{formatMoney(i.total)}</td>
                  <td className="num">{formatMoney(i.paid_amount, { blankZero: true })}</td>
                  <td className="num">{i.status === "void" ? "" : formatMoney(i.total - i.paid_amount, { blankZero: true })}</td>
                  <td>
                    <StatusBadge status={i.status} label={DOC_STATUS_LABELS[i.status]} />
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
              <td colSpan={5}>共 {invoices.length} 張（合計不含作廢）</td>
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
