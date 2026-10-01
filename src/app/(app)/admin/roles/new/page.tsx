import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { RoleForm } from "../RoleForm";
import { createRoleAction } from "../actions";

export const metadata = { title: "新增角色" };

export default async function NewRolePage() {
  await requirePermission("admin.roles");
  return (
    <>
      <PageHeader title="新增角色" />
      <Card className="max-w-4xl">
        <RoleForm action={createRoleAction} />
      </Card>
    </>
  );
}
