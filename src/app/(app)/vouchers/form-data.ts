import { listPostableAccounts } from "@/lib/services/accounts";
import { listPartners } from "@/lib/services/partners";

/** 傳票表單所需之下拉選單資料 */
export function getVoucherFormOptions() {
  return {
    accounts: listPostableAccounts(),
    customers: listPartners("customer", { activeOnly: true }).map((c) => ({ id: c.id, name: `${c.code} ${c.name}` })),
    vendors: listPartners("vendor", { activeOnly: true }).map((v) => ({ id: v.id, name: `${v.code} ${v.name}` })),
  };
}
