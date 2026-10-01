import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getAccount, listAccounts } from "@/lib/services/accounts";
import { ActionButton } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { AccountForm } from "../AccountForm";
import { deleteAccountAction, updateAccountAction } from "../actions";

export const metadata = { title: "編輯科目" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("accounts.manage");
  const account = getAccount(Number((await params).id));
  if (!account) notFound();
  return (
    <>
      <PageHeader
        title={`編輯科目：${account.code} ${account.name}`}
        actions={
          <ActionButton
            action={deleteAccountAction}
            fields={{ id: account.id }}
            label="刪除科目"
            variant="danger"
            confirm="確定刪除此科目？已有分錄之科目無法刪除。"
          />
        }
      />
      <Card className="max-w-3xl">
        <AccountForm action={updateAccountAction} account={account} parents={listAccounts()} />
      </Card>
    </>
  );
}
