import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listRoles } from "@/lib/services/users";
import { Badge, Card, EmptyRow, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "角色權限管理" };

export default async function RolesPage() {
  await requirePermission("admin.roles");
  const roles = listRoles();
  return (
    <>
      <PageHeader
        title="角色權限管理"
        description="以角色設定各模組之操作權限，使用者依所屬角色取得權限。系統預設角色不可刪除。"
        actions={
          <LinkButton href="/admin/roles/new" variant="primary">
            新增角色
          </LinkButton>
        }
      />
      <Card bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>角色代碼</th>
              <th>角色名稱</th>
              <th>說明</th>
              <th className="num">使用者人數</th>
              <th>類型</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 && <EmptyRow colSpan={5} />}
            {roles.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">
                  <Link href={`/admin/roles/${r.id}`} className="link">
                    {r.code}
                  </Link>
                </td>
                <td>{r.name}</td>
                <td className="text-slate-500">{r.description}</td>
                <td className="num">{r.user_count ?? 0}</td>
                <td>{r.is_system ? <Badge color="blue">系統預設</Badge> : <Badge>自訂</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
