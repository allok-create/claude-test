import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getVoucher, getVoucherLines } from "@/lib/services/vouchers";
import { VoucherForm } from "@/components/VoucherForm";
import { PageHeader } from "@/components/ui";
import { updateVoucherAction } from "../../actions";
import { getVoucherFormOptions } from "../../form-data";

export const metadata = { title: "修改傳票" };

export default async function EditVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("vouchers.create");
  const id = Number((await params).id);
  const v = getVoucher(id);
  if (!v) notFound();
  if (v.status !== "draft" || v.source !== "manual") redirect(`/vouchers/${id}`);
  const lines = getVoucherLines(id);
  return (
    <>
      <PageHeader title={`修改傳票 ${v.voucher_no}`} />
      <VoucherForm
        action={updateVoucherAction}
        {...getVoucherFormOptions()}
        initial={{
          id: v.id,
          voucherDate: v.voucher_date,
          voucherType: v.voucher_type,
          description: v.description ?? "",
          lines: lines.map((l) => ({
            accountId: l.account_id,
            description: l.description ?? "",
            debit: l.debit ? String(l.debit / 100) : "",
            credit: l.credit ? String(l.credit / 100) : "",
            partner: l.partner_type && l.partner_id ? `${l.partner_type}:${l.partner_id}` : "",
          })),
        }}
        autoPostHint="修改後仍為未過帳狀態。"
      />
    </>
  );
}
