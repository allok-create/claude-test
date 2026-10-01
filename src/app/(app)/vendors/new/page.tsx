import { requirePermission } from "@/lib/auth/session";
import { PartnerForm } from "@/components/PartnerForm";
import { Card, PageHeader } from "@/components/ui";
import { createVendorAction } from "../actions";

export const metadata = { title: "新增供應商" };

export default async function NewVendorPage() {
  await requirePermission("vendors.manage");
  return (
    <>
      <PageHeader title="新增供應商" />
      <Card className="max-w-3xl">
        <PartnerForm kind="vendor" action={createVendorAction} />
      </Card>
    </>
  );
}
