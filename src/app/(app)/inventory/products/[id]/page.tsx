import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getProduct, listInventoryTransactions, TXN_TYPE_LABELS } from "@/lib/services/inventory";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { ActionButton } from "@/components/forms";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";
import { ProductForm } from "../../ProductForm";
import { deleteProductAction, updateProductAction } from "../../actions";

export const metadata = { title: "商品資料" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const product = getProduct(Number((await params).id));
  if (!product) notFound();
  const canManage = user.permissions.has("inventory.manage");
  // 存貨卡依異動先後排列
  const txns = listInventoryTransactions({ productId: product.id, limit: 1000 }).reverse();
  const value = Math.round(product.quantity_on_hand * product.average_cost);

  return (
    <>
      <PageHeader
        title={`${product.sku} ${product.name}`}
        description={
          <>
            現有數量 {formatQty(product.quantity_on_hand)} {product.unit}・平均成本 {formatMoney(product.average_cost)} 元・存貨價值 {formatMoney(value)} 元
          </>
        }
        actions={
          <>
            <LinkButton href="/inventory">返回列表</LinkButton>
            {canManage && <LinkButton href={`/inventory/adjust?product=${product.id}`}>盤點調整</LinkButton>}
            {canManage && (
              <ActionButton
                action={deleteProductAction}
                fields={{ id: product.id }}
                label="刪除商品"
                variant="danger"
                confirm="確定刪除此商品？已有異動紀錄之商品無法刪除。"
              />
            )}
          </>
        }
      />
      {canManage ? (
        <Card title="商品資料" className="mb-5 max-w-3xl">
          <ProductForm action={updateProductAction} product={product} />
        </Card>
      ) : (
        <Card title="商品資料" className="mb-5 max-w-3xl">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="label">分類</dt><dd>{product.category || "—"}</dd></div>
            <div><dt className="label">單位</dt><dd>{product.unit}</dd></div>
            <div><dt className="label">售價</dt><dd>{formatMoney(product.sale_price)}</dd></div>
            <div><dt className="label">安全存量</dt><dd>{formatQty(product.safety_stock)}</dd></div>
            <div><dt className="label">狀態</dt><dd>{product.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</dd></div>
          </dl>
        </Card>
      )}
      <Card title="存貨卡" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>異動單號</th>
              <th>異動類別</th>
              <th className="num">入庫數量</th>
              <th className="num">出庫數量</th>
              <th className="num">單位成本</th>
              <th className="num">金額</th>
              <th className="num">結存數量</th>
              <th className="num">結存平均成本</th>
              <th>說明</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && <EmptyRow colSpan={11} message="尚無庫存異動" />}
            {txns.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{t.txn_date}</td>
                <td className="font-mono">{t.txn_no}</td>
                <td className="whitespace-nowrap">{TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type}</td>
                <td className="num">{t.quantity > 0 ? formatQty(t.quantity) : ""}</td>
                <td className="num">{t.quantity < 0 ? formatQty(-t.quantity) : ""}</td>
                <td className="num">{formatMoney(t.unit_cost)}</td>
                <td className="num">{formatMoney(t.total_cost)}</td>
                <td className="num">{formatQty(t.balance_qty)}</td>
                <td className="num">{formatMoney(t.balance_avg_cost)}</td>
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
        </table>
      </Card>
    </>
  );
}
