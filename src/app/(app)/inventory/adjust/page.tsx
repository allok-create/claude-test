import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getProduct, listInventoryTransactions, listProducts, TXN_TYPE_LABELS } from "@/lib/services/inventory";
import { today } from "@/lib/utils/date";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Card, EmptyRow, Field, PageHeader } from "@/components/ui";
import { adjustInventoryAction } from "../actions";

export const metadata = { title: "盤點調整" };

type Search = { product?: string; txn?: string; voucher?: string };

export default async function InventoryAdjustPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("inventory.manage");
  const sp = await searchParams;
  const products = listProducts({ activeOnly: true });
  const preselect = Number(sp.product) || "";
  const doneTxn = Number(sp.txn) || 0;
  const doneVoucher = Number(sp.voucher) || 0;
  const recent = listInventoryTransactions({ limit: 300 })
    .filter((t) => t.txn_type === "adjust_in" || t.txn_type === "adjust_out")
    .slice(0, 30);
  const doneRow = doneTxn ? recent.find((t) => t.id === doneTxn) : undefined;
  const doneProduct = doneRow ? getProduct(doneRow.product_id) : undefined;

  return (
    <>
      <PageHeader
        title="盤點調整"
        description="依實地盤點結果調整帳面庫存；系統將自動產生並過帳調整傳票（盤盈：借存貨、貸存貨盤盈；盤損：借存貨盤損、貸存貨）。"
      />
      {doneTxn > 0 && (
        <Alert tone="success">
          庫存調整完成{doneRow ? `（${doneRow.txn_no}，${doneRow.sku} ${doneRow.product_name}，調整 ${formatQty(doneRow.quantity)}）` : ""}
          {doneProduct ? `，調整後數量 ${formatQty(doneProduct.quantity_on_hand)} ${doneProduct.unit}` : ""}。
          {doneVoucher > 0 ? (
            <>
              {" "}
              已產生調整傳票：
              <Link href={`/vouchers/${doneVoucher}`} className="link">
                檢視傳票
              </Link>
            </>
          ) : (
            " 調整金額為 0，未產生傳票。"
          )}
        </Alert>
      )}
      <Card title="新增盤點調整" className="mb-5 max-w-3xl">
        <ActionForm action={adjustInventoryAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="商品" className="sm:col-span-2">
              <select name="productId" className="input" defaultValue={preselect} required>
                <option value="">請選擇商品</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} {p.name}（現有 {formatQty(p.quantity_on_hand)} {p.unit}，平均成本 {formatMoney(p.average_cost)}）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="調整日期">
              <input type="date" name="date" className="input" defaultValue={today()} required />
            </Field>
            <Field label="調整數量" hint="正數為盤盈（增加庫存），負數為盤損（減少庫存）">
              <input type="number" name="quantity" step="any" className="input" required />
            </Field>
            <Field label="單位成本（元）" hint="僅盤盈適用；未填則採目前平均成本。盤損一律以平均成本計算。">
              <input type="number" name="unitCost" step="0.01" min="0" className="input" />
            </Field>
            <Field label="調整原因">
              <input name="reason" className="input" required placeholder="例：年底盤點差異" />
            </Field>
          </div>
          <div className="flex gap-2">
            <SubmitButton>確認調整</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card title="最近盤點調整紀錄" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>異動單號</th>
              <th>商品</th>
              <th>類別</th>
              <th className="num">數量</th>
              <th className="num">單位成本</th>
              <th className="num">金額</th>
              <th>原因</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <EmptyRow colSpan={9} message="尚無盤點調整紀錄" />}
            {recent.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{t.txn_date}</td>
                <td className="font-mono">{t.txn_no}</td>
                <td>
                  <Link href={`/inventory/products/${t.product_id}`} className="link">
                    {t.sku} {t.product_name}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{TXN_TYPE_LABELS[t.txn_type]}</td>
                <td className={`num ${t.quantity < 0 ? "text-rose-600" : ""}`}>{formatQty(t.quantity)}</td>
                <td className="num">{formatMoney(t.unit_cost)}</td>
                <td className="num">{formatMoney(t.total_cost, { parens: false })}</td>
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
