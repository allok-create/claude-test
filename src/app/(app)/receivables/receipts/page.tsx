import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listPartners } from "@/lib/services/partners";
import { listReceipts } from "@/lib/services/receivables";
import { formatMoney } from "@/lib/utils/money";
import { ActionButton } from "@/components/forms";
import { Alert, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";
import { voidReceiptAction } from "../actions";

export const metadata = { title: "收款沖帳" };

type Search = { customerId?: string; from?: string; to?: string; saved?: string };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("ar.view");
  const sp = await searchParams;
  const canManage = user.permissions.has("ar.manage");
  const customers = listPartners("customer");
  const receipts = listReceipts({ customerId: Number(sp.customerId) || undefined, from: sp.from || undefined, to: sp.to || undefined });
  const total = receipts.filter((r) => r.voucher_status !== "void").reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="收款沖帳"
        description="客戶收款並沖銷應收單，系統自動產生收入傳票。作廢收款將回復應收單未收餘額並作廢傳票。"
        actions={
          <>
            <LinkButton href="/receivables">應收單列表</LinkButton>
            {canManage && <LinkButton href="/receivables/receipts/new" variant="primary">新增收款</LinkButton>}
          </>
        }
      />
      {sp.saved && <Alert tone="success">收款已完成沖帳，並已自動產生傳票。</Alert>}
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
              <th>收款單號</th>
              <th>收款日期</th>
              <th>客戶</th>
              <th>收款科目</th>
              <th>沖銷單據</th>
              <th>摘要</th>
              <th className="num">金額</th>
              <th>傳票</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && <EmptyRow colSpan={canManage ? 9 : 8} />}
            {receipts.map((r) => {
              const isVoid = r.voucher_status === "void";
              return (
                <tr key={r.id} className={isVoid ? "text-slate-400 line-through" : ""}>
                  <td className="font-mono">{r.receipt_no}</td>
                  <td className="whitespace-nowrap">{r.receipt_date}</td>
                  <td>
                    <Link href={`/customers/${r.customer_id}`} className="hover:underline">
                      {r.customer_name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.account_code} {r.account_name}
                  </td>
                  <td className="text-xs">{isVoid ? "（已作廢）" : r.allocations}</td>
                  <td className="max-w-xs truncate">{r.description}</td>
                  <td className="num">{formatMoney(r.amount)}</td>
                  <td>
                    {r.voucher_id && (
                      <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono text-xs">
                        {r.voucher_no}
                      </Link>
                    )}
                  </td>
                  {canManage && (
                    <td className="no-underline">
                      {!isVoid && (
                        <ActionButton action={voidReceiptAction} fields={{ id: r.id }} label="作廢" size="sm" variant="danger" promptReason={`請輸入收款單 ${r.receipt_no} 之作廢原因`} />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>共 {receipts.length} 筆（合計不含作廢）</td>
              <td className="num">{formatMoney(total)}</td>
              <td colSpan={canManage ? 2 : 1}></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
