import { requirePermission } from "@/lib/auth/session";
import { listCashAccounts } from "@/lib/services/accounts";
import { listPartners } from "@/lib/services/partners";
import { listBills } from "@/lib/services/payables";
import { today } from "@/lib/utils/date";
import { SettlementForm } from "@/components/SettlementForm";
import { PageHeader } from "@/components/ui";
import { createPaymentAction } from "../../actions";

export const metadata = { title: "新增付款" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ vendorId?: string }> }) {
  await requirePermission("ap.manage");
  const { vendorId } = await searchParams;
  return (
    <>
      <PageHeader title="新增付款" description="選擇供應商後，於未結清應付單輸入本次沖銷金額；亦可僅輸入付款金額，由系統依到期日先後自動沖銷。" />
      <SettlementForm
        mode="ap"
        action={createPaymentAction}
        partners={listPartners("vendor").map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        docs={listBills({ openOnly: true }).map((i) => ({
          id: i.id,
          partnerId: i.vendor_id,
          docNo: i.bill_no,
          docDate: i.bill_date,
          dueDate: i.due_date,
          ref: i.vendor_ref,
          total: i.total,
          outstanding: i.total - i.paid_amount,
        }))}
        cashAccounts={listCashAccounts()}
        defaultDate={today()}
        defaultPartnerId={Number(vendorId) || undefined}
      />
    </>
  );
}
