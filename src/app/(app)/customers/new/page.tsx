import { requirePermission } from "@/lib/auth/session";
import { PartnerForm } from "@/components/PartnerForm";
import { Card, PageHeader } from "@/components/ui";
import { createCustomerAction } from "../actions";

export const metadata = { title: "新增客戶" };

export default async function NewCustomerPage() {
  await requirePermission("customers.manage");
  return (
    <>
      <PageHeader title="新增客戶" />
      <Card className="max-w-3xl">
        <PartnerForm kind="customer" action={createCustomerAction} />
      </Card>
    </>
  );
}
