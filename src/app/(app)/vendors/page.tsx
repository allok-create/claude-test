import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getPartnerBalances, listPartners } from "@/lib/services/partners";
import { formatMoney } from "@/lib/utils/money";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "供應商管理" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("vendors.view");
  const { q = "" } = await searchParams;
  const vendors = listPartners("vendor", { q: q || undefined });
  const balances = getPartnerBalances("vendor");
  const totalOutstanding = vendors.reduce((s, v) => s + (balances.get(v.id) ?? 0), 0);

  return (
    <>
      <PageHeader
        title="供應商管理"
        description="維護供應商基本資料、付款條件與匯款帳戶；未付餘額為未結清應付單之合計。"
        actions={user.permissions.has("vendors.manage") && <LinkButton href="/vendors/new" variant="primary">新增供應商</LinkButton>}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-3 print:hidden">
          <input name="q" defaultValue={q} placeholder="搜尋編號、名稱、統編、聯絡人" className="input w-64" />
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>供應商編號</th>
              <th>供應商名稱</th>
              <th>統一編號</th>
              <th>聯絡人</th>
              <th>電話</th>
              <th className="num">付款條件</th>
              <th>匯款帳戶</th>
              <th className="num">未付餘額</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && <EmptyRow colSpan={9} />}
            {vendors.map((v) => (
              <tr key={v.id}>
                <td className="font-mono">{v.code}</td>
                <td>
                  <Link href={`/vendors/${v.id}`} className="link">
                    {v.name}
                  </Link>
                </td>
                <td className="font-mono">{v.tax_id}</td>
                <td>{v.contact_person}</td>
                <td className="whitespace-nowrap">{v.phone}</td>
                <td className="num">{v.payment_terms_days} 天</td>
                <td className="max-w-xs truncate text-xs text-slate-600">{v.bank_account}</td>
                <td className="num">{formatMoney(balances.get(v.id) ?? 0, { blankZero: true })}</td>
                <td>{v.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>共 {vendors.length} 筆</td>
              <td className="num">{formatMoney(totalOutstanding)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
