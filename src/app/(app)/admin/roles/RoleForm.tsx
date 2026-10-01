import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import type { Role } from "@/lib/services/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function RoleForm({
  action,
  role,
  permissions = [],
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  role?: Role;
  permissions?: string[];
}) {
  const granted = new Set(permissions);
  const isSystem = !!role?.is_system;
  return (
    <ActionForm action={action}>
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="角色代碼" hint={isSystem ? "系統預設角色之代碼不可變更" : "2–30 碼小寫英數字或底線"}>
          <input
            name="code"
            className={`input ${isSystem ? "bg-slate-50" : ""}`}
            defaultValue={role?.code}
            required
            readOnly={isSystem}
            pattern="[a-z0-9_]{2,30}"
          />
        </Field>
        <Field label="角色名稱">
          <input name="name" className="input" defaultValue={role?.name} required />
        </Field>
        <Field label="說明" className="sm:col-span-2">
          <input name="description" className="input" defaultValue={role?.description ?? ""} />
        </Field>
      </div>
      <div>
        <div className="label">權限設定</div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="table">
            <thead>
              <tr>
                <th className="w-32">模組</th>
                <th>權限</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <tr key={g.module}>
                  <td className="font-medium whitespace-nowrap">{g.module}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name="permissions" value={p.key} defaultChecked={granted.has(p.key)} />
                          {p.label}
                          <span className="font-mono text-xs text-slate-400">{p.key}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {role?.code === "admin" && <p className="mt-1 text-xs text-amber-600">系統管理員角色必須保留「使用者管理」與「角色權限管理」權限。</p>}
      </div>
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
