import { requirePermission } from "@/lib/auth/session";
import { listCashAccounts } from "@/lib/services/accounts";
import { listPartners } from "@/lib/services/partners";
import { listInvoices } from "@/lib/services/receivables";
import { today } from "@/lib/utils/date";
import { SettlementForm } from "@/components/SettlementForm";
import { PageHeader } from "@/components/ui";
import { createReceiptAction } from "../../actions";

export const metadata = { title: "新增收款" };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requirePermission("ar.manage");
  const { customerId } = await searchParams;
  return (
    <>
      <PageHeader title="新增收款" description="選擇客戶後，於未結清應收單輸入本次沖銷金額；亦可僅輸入收款金額，由系統依到期日先後自動沖銷。" />
      <SettlementForm
        mode="ar"
        action={createReceiptAction}
        partners={listPartners("customer").map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        docs={listInvoices({ openOnly: true }).map((i) => ({
          id: i.id,
          partnerId: i.customer_id,
          docNo: i.invoice_no,
          docDate: i.invoice_date,
          dueDate: i.due_date,
          ref: i.gui_no,
          total: i.total,
          outstanding: i.total - i.paid_amount,
        }))}
        cashAccounts={listCashAccounts()}
        defaultDate={today()}
        defaultPartnerId={Number(customerId) || undefined}
      />
    </>
  );
}
