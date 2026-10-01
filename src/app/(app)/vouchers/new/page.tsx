import { requirePermission } from "@/lib/auth/session";
import { isAutoPostEnabled } from "@/lib/services/settings";
import { today } from "@/lib/utils/date";
import { VoucherForm } from "@/components/VoucherForm";
import { PageHeader } from "@/components/ui";
import { createVoucherAction } from "../actions";
import { getVoucherFormOptions } from "../form-data";

export const metadata = { title: "新增傳票" };

export default async function NewVoucherPage() {
  const user = await requirePermission("vouchers.create");
  const willPost = isAutoPostEnabled() && user.permissions.has("vouchers.post");
  return (
    <>
      <PageHeader title="新增傳票" description="每筆分錄僅能輸入借方或貸方金額，借貸合計須相等方可儲存。" />
      <VoucherForm
        action={createVoucherAction}
        {...getVoucherFormOptions()}
        initial={{ voucherDate: today(), voucherType: "transfer", description: "", lines: [] }}
        autoPostHint={willPost ? "已啟用自動過帳：儲存後將立即過帳至總帳。" : "儲存後為「未過帳」狀態，需經過帳才會反映於帳簿及報表。"}
      />
    </>
  );
}
