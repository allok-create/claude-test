import type { Role, UserRow } from "@/lib/services/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function UserForm({
  action,
  user,
  roles,
  isSelf = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  user?: UserRow;
  roles: Role[];
  isSelf?: boolean;
}) {
  return (
    <ActionForm action={action}>
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="帳號" hint={user ? "帳號建立後不可變更" : "3–30 碼英數字，可含 . _ -"}>
          {user ? (
            <input className="input bg-slate-50" value={user.username} disabled readOnly />
          ) : (
            <input name="username" className="input" required pattern="[A-Za-z0-9_.\-]{3,30}" autoComplete="off" />
          )}
        </Field>
        <Field label="姓名">
          <input name="displayName" className="input" defaultValue={user?.display_name} required />
        </Field>
        <Field label="電子郵件">
          <input name="email" type="email" className="input" defaultValue={user?.email ?? ""} />
        </Field>
        <Field label="角色" hint={isSelf ? "不可變更自己的角色" : undefined}>
          {isSelf && user ? (
            <>
              <input type="hidden" name="roleId" value={user.role_id} />
              <input className="input bg-slate-50" value={user.role_name} disabled readOnly />
            </>
          ) : (
            <select name="roleId" className="input" defaultValue={user?.role_id ?? ""} required>
              <option value="">請選擇角色</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={user ? "重設密碼" : "密碼"} hint={user ? "留空表示不變更；重設後該使用者須重新登入" : "至少 8 碼，須同時包含英文字母與數字"}>
          <input name="password" type="password" className="input" required={!user} autoComplete="new-password" />
        </Field>
        <Field label="確認密碼">
          <input name="confirm" type="password" className="input" required={!user} autoComplete="new-password" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          {isSelf ? (
            <>
              <input type="hidden" name="isActive" value="1" />
              <input type="checkbox" checked disabled readOnly /> 啟用（不可停用自己的帳號）
            </>
          ) : (
            <>
              <input type="checkbox" name="isActive" defaultChecked={user ? !!user.is_active : true} /> 啟用
            </>
          )}
        </label>
      </div>
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
