import { requirePermission } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { Card, PageHeader } from "@/components/ui";
import { AccountForm } from "../AccountForm";
import { createAccountAction } from "../actions";

export const metadata = { title: "新增科目" };

export default async function NewAccountPage() {
  await requirePermission("accounts.manage");
  return (
    <>
      <PageHeader title="新增會計科目" />
      <Card className="max-w-3xl">
        <AccountForm action={createAccountAction} parents={listAccounts()} />
      </Card>
    </>
  );
}
