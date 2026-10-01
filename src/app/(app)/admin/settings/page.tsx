import { requirePermission } from "@/lib/auth/session";
import { ACCOUNT_MAPPING_LABELS } from "@/lib/db/chart-of-accounts";
import { listPostableAccounts } from "@/lib/services/accounts";
import { getAllSettings } from "@/lib/services/settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveSettingsAction } from "./actions";

export const metadata = { title: "系統設定" };

export default async function SettingsPage() {
  await requirePermission("admin.settings");
  const s = getAllSettings();
  const accounts = listPostableAccounts();
  const codes = new Set(accounts.map((a) => a.code));
  const rate = Number(s["tax.default_rate"] ?? "0.05");
  const ratePct = Number.isFinite(rate) ? Math.round(rate * 10000) / 100 : 5;

  return (
    <>
      <PageHeader title="系統設定" description="公司基本資料、過帳與關帳控制，以及各模組自動產生傳票時使用之會計科目。" />
      <ActionForm action={saveSettingsAction} className="max-w-4xl space-y-5">
        <Card title="公司資料">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="公司名稱">
              <input name="company.name" className="input" defaultValue={s["company.name"] ?? ""} required />
            </Field>
            <Field label="統一編號" hint="8 位數字">
              <input name="company.tax_id" className="input" defaultValue={s["company.tax_id"] ?? ""} pattern="\d{8}" inputMode="numeric" maxLength={8} />
            </Field>
            <Field label="地址" className="sm:col-span-2">
              <input name="company.address" className="input" defaultValue={s["company.address"] ?? ""} />
            </Field>
            <Field label="電話">
              <input name="company.phone" className="input" defaultValue={s["company.phone"] ?? ""} />
            </Field>
            <Field label="負責人">
              <input name="company.owner" className="input" defaultValue={s["company.owner"] ?? ""} />
            </Field>
          </div>
        </Card>

        <Card title="過帳設定">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="posting.auto" className="mt-0.5" defaultChecked={(s["posting.auto"] ?? "1") === "1"} />
              <span>
                傳票儲存後自動過帳
                <span className="block text-xs text-slate-400">關閉時，手動輸入之傳票將保留為草稿，須至「自動過帳」作業或傳票明細頁過帳。</span>
              </span>
            </label>
            <Field label="關帳日" hint="關帳日（含）以前之傳票不得新增、修改、過帳或作廢。留空表示未關帳。">
              <input type="date" name="posting.closing_date" className="input" defaultValue={s["posting.closing_date"] ?? ""} />
            </Field>
            <Field label="預設營業稅率（%）" hint="應收、應付單據預設之稅率，一般為 5%">
              <input type="number" name="tax.default_rate" className="input" step="0.01" min="0" max="100" defaultValue={ratePct} required />
            </Field>
          </div>
        </Card>

        <Card title="系統對應科目">
          <p className="mb-3 text-xs text-slate-500">應收、應付、庫存及結帳作業自動產生傳票時，依下列對應使用會計科目（須為明細科目）。</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(ACCOUNT_MAPPING_LABELS).map(([key, label]) => {
              const current = s[key] ?? "";
              return (
                <Field key={key} label={label} hint={<span className="font-mono">{key}</span>}>
                  <select name={key} className="input" defaultValue={current} required>
                    <option value="">請選擇科目</option>
                    {current && !codes.has(current) && <option value={current}>{current}（科目不存在或已停用）</option>}
                    {accounts.map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </div>
        </Card>

        <div className="flex gap-2">
          <SubmitButton>儲存設定</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
