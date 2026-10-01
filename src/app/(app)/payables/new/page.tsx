import { requirePermission } from "@/lib/auth/session";
import { getAccountByCode, listPostableAccounts } from "@/lib/services/accounts";
import { listProducts } from "@/lib/services/inventory";
import { listPartners } from "@/lib/services/partners";
import { TAX_RATE_OPTIONS } from "@/lib/services/receivables";
import { getSetting } from "@/lib/services/settings";
import { today } from "@/lib/utils/date";
import { TradeDocForm } from "@/components/TradeDocForm";
import { PageHeader } from "@/components/ui";
import { createBillAction } from "../actions";

export const metadata = { title: "登錄應付單" };

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ vendorId?: string }> }) {
  await requirePermission("ap.manage");
  const { vendorId } = await searchParams;
  const expense = getAccountByCode(getSetting("acct.purchase_expense"));
  return (
    <>
      <PageHeader title="登錄應付單" description="選擇商品時將自動帶入平均成本並於儲存時入庫（借記存貨）；非商品明細可指定費用或資產科目。" />
      <TradeDocForm
        mode="ap"
        action={createBillAction}
        partners={listPartners("vendor", { activeOnly: true }).map((c) => ({ id: c.id, code: c.code, name: c.name, paymentTermsDays: c.payment_terms_days }))}
        products={listProducts({ activeOnly: true }).map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: Math.round(p.average_cost), stock: p.quantity_on_hand }))}
        accounts={listPostableAccounts().filter((a) => a.type === "expense" || a.type === "asset")}
        taxRates={TAX_RATE_OPTIONS}
        defaultDate={today()}
        defaultPartnerId={Number(vendorId) || undefined}
        defaultAccountLabel={expense ? `${expense.code} ${expense.name}` : "進貨／費用"}
      />
    </>
  );
}
