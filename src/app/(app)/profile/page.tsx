import { requireUser } from "@/lib/auth/session";
import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import { getUser } from "@/lib/services/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, PageHeader } from "@/components/ui";
import { changePasswordAction } from "./actions";

export const metadata = { title: "個人資料" };

export default async function ProfilePage() {
  const me = await requireUser();
  const info = getUser(me.id);
  const perms = PERMISSION_GROUPS.flatMap((g) => g.permissions.filter((p) => me.permissions.has(p.key)).map((p) => `${g.module}－${p.label}`));

  return (
    <>
      <PageHeader title="個人資料" description="檢視帳號資訊與變更登入密碼。" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="帳號資訊">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">帳號</dt>
            <dd className="font-mono">{me.username}</dd>
            <dt className="text-slate-500">姓名</dt>
            <dd>{me.displayName}</dd>
            <dt className="text-slate-500">電子郵件</dt>
            <dd>{info?.email || "—"}</dd>
            <dt className="text-slate-500">角色</dt>
            <dd>{me.roleName}</dd>
            <dt className="text-slate-500">最後登入</dt>
            <dd>{info?.last_login_at ?? "—"}</dd>
            <dt className="text-slate-500">權限</dt>
            <dd>
              {perms.length === 0 ? (
                "—"
              ) : (
                <ul className="list-inside list-disc text-xs text-slate-600">
                  {perms.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </Card>
        <Card title="變更密碼">
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="目前密碼">
              <input type="password" name="current" className="input" required autoComplete="current-password" />
            </Field>
            <Field label="新密碼" hint="至少 8 碼，須同時包含英文字母與數字">
              <input type="password" name="next" className="input" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="確認新密碼">
              <input type="password" name="confirm" className="input" required minLength={8} autoComplete="new-password" />
            </Field>
            <div className="flex gap-2">
              <SubmitButton>變更密碼</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
