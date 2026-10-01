import { requirePermission } from "@/lib/auth/session";
import { getAccountByCode, listPostableAccounts } from "@/lib/services/accounts";
import { listProducts } from "@/lib/services/inventory";
import { listPartners } from "@/lib/services/partners";
import { TAX_RATE_OPTIONS } from "@/lib/services/receivables";
import { getSetting } from "@/lib/services/settings";
import { today } from "@/lib/utils/date";
import { TradeDocForm } from "@/components/TradeDocForm";
import { PageHeader } from "@/components/ui";
import { createInvoiceAction } from "../actions";

export const metadata = { title: "開立應收單" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requirePermission("ar.manage");
  const { customerId } = await searchParams;
  const sales = getAccountByCode(getSetting("acct.sales"));
  return (
    <>
      <PageHeader title="開立應收單" description="選擇商品時將自動帶入售價並於儲存時出庫、認列銷貨成本；非商品明細可指定收入科目。" />
      <TradeDocForm
        mode="ar"
        action={createInvoiceAction}
        partners={listPartners("customer", { activeOnly: true }).map((c) => ({ id: c.id, code: c.code, name: c.name, paymentTermsDays: c.payment_terms_days }))}
        products={listProducts({ activeOnly: true }).map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: p.sale_price, stock: p.quantity_on_hand }))}
        accounts={listPostableAccounts().filter((a) => a.type === "revenue")}
        taxRates={TAX_RATE_OPTIONS}
        defaultDate={today()}
        defaultPartnerId={Number(customerId) || undefined}
        defaultAccountLabel={sales ? `${sales.code} ${sales.name}` : "銷貨收入"}
      />
    </>
  );
}
