import { PARTNER_LABEL, type Partner, type PartnerKind } from "@/lib/services/partners";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/lib/action";

/** 客戶／供應商主檔表單（伺服器元件，兩者共用） */
export function PartnerForm({
  kind,
  action,
  partner,
}: {
  kind: PartnerKind;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  partner?: Partner;
}) {
  const label = PARTNER_LABEL[kind];
  return (
    <ActionForm action={action}>
      {partner && <input type="hidden" name="id" value={partner.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${label}編號`} hint="1–20 碼英數字">
          <input name="code" className="input" defaultValue={partner?.code} required pattern="[0-9A-Za-z_\-]{1,20}" />
        </Field>
        <Field label={`${label}名稱`}>
          <input name="name" className="input" defaultValue={partner?.name} required />
        </Field>
        <Field label="統一編號" hint="8 碼數字，個人可留空">
          <input name="taxId" className="input" defaultValue={partner?.tax_id ?? ""} pattern="\d{8}" inputMode="numeric" maxLength={8} />
        </Field>
        <Field label="聯絡人">
          <input name="contactPerson" className="input" defaultValue={partner?.contact_person ?? ""} />
        </Field>
        <Field label="電話">
          <input name="phone" className="input" defaultValue={partner?.phone ?? ""} />
        </Field>
        <Field label="電子郵件">
          <input name="email" type="email" className="input" defaultValue={partner?.email ?? ""} />
        </Field>
        <Field label="地址" className="sm:col-span-2">
          <input name="address" className="input" defaultValue={partner?.address ?? ""} />
        </Field>
        <Field label={kind === "customer" ? "收款條件（天）" : "付款條件（天）"} hint="單據未指定到期日時，依此天數自動計算，例：月結 30 天">
          <input name="paymentTermsDays" type="number" min={0} max={365} className="input" defaultValue={partner?.payment_terms_days ?? 30} required />
        </Field>
        {kind === "customer" ? (
          <Field label="信用額度（元）" hint="0 表示不限額度；開立應收單時檢查未收餘額是否超過額度">
            <input name="creditLimit" className="input text-right" inputMode="decimal" defaultValue={partner ? (partner.credit_limit ?? 0) / 100 : 0} />
          </Field>
        ) : (
          <Field label="匯款帳戶" hint="例：台灣銀行 004 城中分行 012345678901">
            <input name="bankAccount" className="input" defaultValue={partner?.bank_account ?? ""} />
          </Field>
        )}
        <Field label="備註" className="sm:col-span-2">
          <textarea name="notes" rows={2} className="input" defaultValue={partner?.notes ?? ""} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={partner ? !!partner.is_active : true} /> 啟用
        </label>
      </div>
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
