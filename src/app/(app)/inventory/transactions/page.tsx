import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listInventoryTransactions, listProducts, TXN_TYPE_LABELS } from "@/lib/services/inventory";
import { startOfMonth, today } from "@/lib/utils/date";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { Card, EmptyRow, PageHeader } from "@/components/ui";

export const metadata = { title: "庫存異動" };

type Search = { product?: string; from?: string; to?: string };

export default async function InventoryTransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("inventory.view");
  const sp = await searchParams;
  const from = sp.from ?? startOfMonth(today());
  const to = sp.to ?? today();
  const productId = Number(sp.product) || undefined;
  const products = listProducts();
  const txns = listInventoryTransactions({ productId, from: from || undefined, to: to || undefined });
  const totalIn = txns.filter((t) => t.total_cost > 0).reduce((s, t) => s + t.total_cost, 0);
  const totalOut = txns.filter((t) => t.total_cost < 0).reduce((s, t) => s - t.total_cost, 0);

  return (
    <>
      <PageHeader title="庫存異動" description="進貨、銷貨、盤點調整等所有庫存異動紀錄（最近 500 筆）。" />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">商品</span>
            <select name="product" defaultValue={productId ?? ""} className="input w-64">
              <option value="">全部商品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} {p.name}
                </option>
              ))}
            </select>
          </label>
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
              <th>日期</th>
              <th>異動單號</th>
              <th>商品</th>
              <th>異動類別</th>
              <th className="num">數量</th>
              <th className="num">單位成本</th>
              <th className="num">金額</th>
              <th className="num">結存數量</th>
              <th>說明</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && <EmptyRow colSpan={10} />}
            {txns.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{t.txn_date}</td>
                <td className="font-mono">{t.txn_no}</td>
                <td>
                  <Link href={`/inventory/products/${t.product_id}`} className="link">
                    {t.sku} {t.product_name}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type}</td>
                <td className={`num ${t.quantity < 0 ? "text-rose-600" : ""}`}>
                  {formatQty(t.quantity)} {t.unit}
                </td>
                <td className="num">{formatMoney(t.unit_cost)}</td>
                <td className="num">
                  {formatMoney(t.total_cost, { parens: false })}
                </td>
                <td className="num">{formatQty(t.balance_qty)}</td>
                <td className="max-w-xs truncate text-slate-500">{t.description}</td>
                <td>
                  {t.voucher_id ? (
                    <Link href={`/vouchers/${t.voucher_id}`} className="link">
                      檢視
                    </Link>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={10}>
                共 {txns.length} 筆；入庫成本合計 {formatMoney(totalIn)} 元，出庫成本合計 {formatMoney(totalOut)} 元
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}
