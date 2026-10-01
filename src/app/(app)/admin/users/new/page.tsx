import { requirePermission } from "@/lib/auth/session";
import { listRoles } from "@/lib/services/users";
import { Card, PageHeader } from "@/components/ui";
import { UserForm } from "../UserForm";
import { createUserAction } from "../actions";

export const metadata = { title: "新增使用者" };

export default async function NewUserPage() {
  await requirePermission("admin.users");
  return (
    <>
      <PageHeader title="新增使用者" />
      <Card className="max-w-3xl">
        <UserForm action={createUserAction} roles={listRoles()} />
      </Card>
    </>
  );
}
