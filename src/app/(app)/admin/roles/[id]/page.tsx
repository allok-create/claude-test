import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getRole, getRolePermissions, listRoles } from "@/lib/services/users";
import { ActionButton } from "@/components/forms";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { RoleForm } from "../RoleForm";
import { deleteRoleAction, updateRoleAction } from "../actions";

export const metadata = { title: "編輯角色" };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("admin.roles");
  const role = getRole(Number((await params).id));
  if (!role) notFound();
  const userCount = listRoles().find((r) => r.id === role.id)?.user_count ?? 0;
  return (
    <>
      <PageHeader
        title={`編輯角色：${role.name}`}
        description={`目前有 ${userCount} 位使用者屬於此角色；權限變更於下次載入頁面時生效。`}
        actions={
          <>
            <LinkButton href="/admin/roles">返回列表</LinkButton>
            {!role.is_system && (
              <ActionButton
                action={deleteRoleAction}
                fields={{ id: role.id }}
                label="刪除角色"
                variant="danger"
                confirm="確定刪除此角色？仍有使用者之角色無法刪除。"
              />
            )}
          </>
        }
      />
      <Card className="max-w-4xl">
        <RoleForm action={updateRoleAction} role={role} permissions={getRolePermissions(role.id)} />
      </Card>
    </>
  );
}
