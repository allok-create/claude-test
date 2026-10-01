import { ACCOUNT_CATEGORIES, ACCOUNT_TYPE_LABELS, type Account } from "@/lib/services/accounts";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function AccountForm({
  action,
  account,
  parents,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  account?: Account;
  parents: Pick<Account, "id" | "code" | "name" | "level">[];
}) {
  return (
    <ActionForm action={action}>
      {account && <input type="hidden" name="id" value={account.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="上層科目" hint={account ? "上層科目建立後不可變更" : "下層科目代碼須以上層代碼開頭"}>
          <select name="parentId" className="input" defaultValue={account?.parent_id ?? ""} disabled={!!account}>
            <option value="">（無，為第一層科目）</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {"　".repeat(p.level - 1)}
                {p.code} {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="科目代碼">
          <input name="code" className="input" defaultValue={account?.code} required disabled={!!account} pattern="[0-9A-Za-z]{1,12}" />
        </Field>
        <Field label="科目名稱">
          <input name="name" className="input" defaultValue={account?.name} required />
        </Field>
        <Field label="科目類別">
          <select name="type" className="input" defaultValue={account?.type ?? "asset"}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="報表分類" hint="決定科目於損益表／資產負債表之列示位置">
          <select name="category" className="input" defaultValue={account?.category ?? "current_asset"}>
            {ACCOUNT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {ACCOUNT_TYPE_LABELS[c.type]}－{c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="正常餘額方向" hint="抵銷科目（如累計折舊）請選擇與類別相反之方向">
          <select name="normalBalance" className="input" defaultValue={account?.normal_balance ?? ""}>
            <option value="">依科目類別自動判斷</option>
            <option value="debit">借方</option>
            <option value="credit">貸方</option>
          </select>
        </Field>
        <Field label="說明" className="sm:col-span-2">
          <input name="description" className="input" defaultValue={account?.description ?? ""} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={account ? !!account.is_active : true} /> 啟用
        </label>
      </div>
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
