import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getUser, listRoles } from "@/lib/services/users";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { UserForm } from "../UserForm";
import { updateUserAction } from "../actions";

export const metadata = { title: "編輯使用者" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("admin.users");
  const user = getUser(Number((await params).id));
  if (!user) notFound();
  return (
    <>
      <PageHeader
        title={`編輯使用者：${user.username}`}
        description={`建立時間 ${user.created_at}・最後登入 ${user.last_login_at ?? "從未登入"}`}
        actions={<LinkButton href="/admin/users">返回列表</LinkButton>}
      />
      <Card className="max-w-3xl">
        <UserForm action={updateUserAction} user={user} roles={listRoles()} isSelf={user.id === me.id} />
      </Card>
    </>
  );
}
