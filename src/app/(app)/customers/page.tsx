import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getPartnerBalances, listPartners } from "@/lib/services/partners";
import { formatMoney } from "@/lib/utils/money";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "客戶管理" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("customers.view");
  const { q = "" } = await searchParams;
  const customers = listPartners("customer", { q: q || undefined });
  const balances = getPartnerBalances("customer");
  const totalOutstanding = customers.reduce((s, c) => s + (balances.get(c.id) ?? 0), 0);

  return (
    <>
      <PageHeader
        title="客戶管理"
        description="維護客戶基本資料、收款條件與信用額度；未收餘額為未結清應收單之合計。"
        actions={user.permissions.has("customers.manage") && <LinkButton href="/customers/new" variant="primary">新增客戶</LinkButton>}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-3 print:hidden">
          <input name="q" defaultValue={q} placeholder="搜尋編號、名稱、統編、聯絡人" className="input w-64" />
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>客戶編號</th>
              <th>客戶名稱</th>
              <th>統一編號</th>
              <th>聯絡人</th>
              <th>電話</th>
              <th className="num">收款條件</th>
              <th className="num">信用額度</th>
              <th className="num">未收餘額</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && <EmptyRow colSpan={9} />}
            {customers.map((c) => {
              const bal = balances.get(c.id) ?? 0;
              const over = (c.credit_limit ?? 0) > 0 && bal > (c.credit_limit ?? 0);
              return (
                <tr key={c.id}>
                  <td className="font-mono">{c.code}</td>
                  <td>
                    <Link href={`/customers/${c.id}`} className="link">
                      {c.name}
                    </Link>
                  </td>
                  <td className="font-mono">{c.tax_id}</td>
                  <td>{c.contact_person}</td>
                  <td className="whitespace-nowrap">{c.phone}</td>
                  <td className="num">{c.payment_terms_days} 天</td>
                  <td className="num">{c.credit_limit ? formatMoney(c.credit_limit) : <span className="text-slate-400">不限</span>}</td>
                  <td className={`num ${over ? "font-semibold text-rose-600" : ""}`}>{formatMoney(bal, { blankZero: true })}</td>
                  <td>{c.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>共 {customers.length} 筆</td>
              <td className="num">{formatMoney(totalOutstanding)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
