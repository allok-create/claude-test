import { resetDbForTests } from "@/lib/db";
import { createPartner } from "@/lib/services/partners";
import { createProduct } from "@/lib/services/inventory";
import { getAccountByCode } from "@/lib/services/accounts";

export const ADMIN = 1;

export function freshDb() {
  return resetDbForTests();
}

export function acct(code: string): number {
  const a = getAccountByCode(code);
  if (!a) throw new Error(`account ${code} missing`);
  return a.id;
}

export function makeCustomer(code = "C001", extra: Partial<Parameters<typeof createPartner>[1]> = {}) {
  return createPartner("customer", { code, name: `客戶${code}`, paymentTermsDays: 30, isActive: true, ...extra }, ADMIN);
}

export function makeVendor(code = "V001") {
  return createPartner("vendor", { code, name: `供應商${code}`, paymentTermsDays: 30, isActive: true }, ADMIN);
}

export function makeProduct(sku = "P001") {
  return createProduct({ sku, name: `商品${sku}`, unit: "個", salePrice: 0, safetyStock: 0, isActive: true }, ADMIN);
}
