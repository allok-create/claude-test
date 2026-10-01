import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "../../ProductForm";
import { createProductAction } from "../../actions";

export const metadata = { title: "新增商品" };

export default async function NewProductPage() {
  await requirePermission("inventory.manage");
  return (
    <>
      <PageHeader title="新增商品" />
      <Card className="max-w-3xl">
        <ProductForm action={createProductAction} />
      </Card>
    </>
  );
}
