import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getInventoryValuation } from "@/lib/services/inventory";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "商品與庫存" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const user = await requirePermission("inventory.view");
  const { q = "", low = "" } = await searchParams;
  const canManage = user.permissions.has("inventory.manage");
  const lowOnly = low === "1";
  const query = q.trim().toLowerCase();
  const items = getInventoryValuation().items.filter(
    (p) =>
      (!lowOnly || (p.safety_stock > 0 && p.quantity_on_hand <= p.safety_stock)) &&
      (!query || p.sku.toLowerCase().includes(query) || p.name.toLowerCase().includes(query) || (p.category ?? "").toLowerCase().includes(query)),
  );
  const totalValue = items.reduce((s, i) => s + i.value, 0);

  return (
    <>
      <PageHeader
        title="商品與庫存"
        description="商品主檔與即時庫存；存貨成本採移動加權平均法計算。"
        actions={
          <>
            <LinkButton href="/inventory/transactions">庫存異動</LinkButton>
            {canManage && <LinkButton href="/inventory/adjust">盤點調整</LinkButton>}
            {canManage && (
              <LinkButton href="/inventory/products/new" variant="primary">
                新增商品
              </LinkButton>
            )}
          </>
        }
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 print:hidden">
          <input name="q" defaultValue={q} placeholder="搜尋編號、名稱或分類" className="input w-56" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> 僅顯示低於安全存量
          </label>
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>商品編號</th>
              <th>商品名稱</th>
              <th>分類</th>
              <th>單位</th>
              <th className="num">售價</th>
              <th className="num">現有數量</th>
              <th className="num">安全存量</th>
              <th className="num">平均成本</th>
              <th className="num">存貨價值</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={10} />}
            {items.map((p) => {
              const isLow = p.safety_stock > 0 && p.quantity_on_hand <= p.safety_stock;
              return (
                <tr key={p.id}>
                  <td className="font-mono">
                    <Link href={`/inventory/products/${p.id}`} className="link">
                      {p.sku}
                    </Link>
                  </td>
                  <td>{p.name}</td>
                  <td className="text-slate-500">{p.category}</td>
                  <td>{p.unit}</td>
                  <td className="num">{formatMoney(p.sale_price)}</td>
                  <td className={`num ${isLow ? "font-semibold text-rose-600" : ""}`}>{formatQty(p.quantity_on_hand)}</td>
                  <td className="num">{formatQty(p.safety_stock)}</td>
                  <td className="num">{formatMoney(Math.round(p.average_cost))}</td>
                  <td className="num">{formatMoney(p.value)}</td>
                  <td>{p.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8}>共 {items.length} 項商品，存貨價值合計</td>
              <td className="num">{formatMoney(totalValue)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
