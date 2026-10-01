import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listUsers } from "@/lib/services/users";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "使用者管理" };

export default async function UsersPage() {
  const me = await requirePermission("admin.users");
  const users = listUsers();
  return (
    <>
      <PageHeader
        title="使用者管理"
        description="建立系統使用者並指派角色；停用帳號或重設密碼後，該使用者之登入狀態將立即失效。"
        actions={
          <LinkButton href="/admin/users/new" variant="primary">
            新增使用者
          </LinkButton>
        }
      />
      <Card bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>帳號</th>
              <th>姓名</th>
              <th>電子郵件</th>
              <th>角色</th>
              <th>狀態</th>
              <th>最後登入</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <EmptyRow colSpan={6} />}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono">
                  <Link href={`/admin/users/${u.id}`} className="link">
                    {u.username}
                  </Link>
                  {u.id === me.id && <span className="ml-1 text-xs text-slate-400">（本人）</span>}
                </td>
                <td>{u.display_name}</td>
                <td className="text-slate-500">{u.email}</td>
                <td>{u.role_name}</td>
                <td>{u.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</td>
                <td className="whitespace-nowrap text-slate-500">{u.last_login_at ?? "從未登入"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
