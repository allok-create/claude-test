import type { Product } from "@/lib/services/inventory";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function ProductForm({
  action,
  product,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  product?: Product;
}) {
  return (
    <ActionForm action={action}>
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="商品編號（SKU）" hint="1–30 碼英數字、底線或連字號">
          <input name="sku" className="input" defaultValue={product?.sku} required pattern="[0-9A-Za-z_\-]{1,30}" />
        </Field>
        <Field label="商品名稱">
          <input name="name" className="input" defaultValue={product?.name} required />
        </Field>
        <Field label="分類">
          <input name="category" className="input" defaultValue={product?.category ?? ""} />
        </Field>
        <Field label="單位">
          <input name="unit" className="input" defaultValue={product?.unit ?? "個"} required />
        </Field>
        <Field label="售價（元，未稅）">
          <input name="salePrice" type="number" step="0.01" min="0" className="input" defaultValue={product ? product.sale_price / 100 : ""} />
        </Field>
        <Field label="安全存量" hint="現有數量低於或等於安全存量時標示提醒；0 表示不檢查">
          <input name="safetyStock" type="number" step="any" min="0" className="input" defaultValue={product?.safety_stock ?? 0} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={product ? !!product.is_active : true} /> 啟用
        </label>
      </div>
      {!product && <p className="text-xs text-slate-500">庫存數量與平均成本由進貨、銷貨及盤點調整自動計算，無法直接修改。</p>}
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
