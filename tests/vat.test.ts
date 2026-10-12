import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/services/settings";
import { createInvoice, createArAllowance, getInvoice, voidInvoice, voidArAllowance } from "@/lib/services/receivables";
import { createBill, createApAllowance, getBill } from "@/lib/services/payables";
import { buildMediaFile, collectVatRecords, computeVat401, fileVatPeriod, unfileVatPeriod } from "@/lib/services/vat";
import { vatPeriodOf, vatPeriodRange } from "@/lib/services/vat-lock";
import { getTrialBalance } from "@/lib/services/reports";
import { getVoucherLines } from "@/lib/services/vouchers";
import { ADMIN, acct, freshDb, makeCustomer, makeVendor } from "./helpers";

const P = "2026-03";

function setup() {
  freshDb();
  setSetting("company.tax_id", "12345678");
  setSetting("company.tax_reg_no", "123456789");
  const customer = makeCustomer("C001", { taxId: "24536806" });
  const vendor = makeVendor("V001");
  getDb().prepare("UPDATE vendors SET tax_id = '86517413' WHERE id = ?").run(vendor);
  return { customer, vendor };
}

const svc = (price: number) => [{ description: "服務", quantity: 1, unitPrice: price }];

describe("營業稅期別", () => {
  it("每兩個月一期", () => {
    expect(vatPeriodOf("2026-04-30")).toBe("2026-03");
    expect(vatPeriodOf("2026-11-01")).toBe("2026-11");
    expect(vatPeriodRange("2028-01")).toEqual({ from: "2028-01-01", to: "2028-02-29" });
  });
});

describe("營業稅申報", () => {
  let customer: number;
  let vendor: number;

  beforeEach(() => {
    ({ customer, vendor } = setup());
    createInvoice({ customerId: customer, invoiceDate: "2026-03-05", guiNo: "AB00000001", invoiceFormat: "35", taxType: "1", lines: svc(10_000_00) }, ADMIN);
    createInvoice({ customerId: customer, invoiceDate: "2026-03-06", guiNo: "AB00000002", invoiceFormat: "32", taxType: "1", lines: svc(1_000_00) }, ADMIN);
    createInvoice({ customerId: customer, invoiceDate: "2026-04-01", guiNo: "AB00000003", invoiceFormat: "31", taxType: "2", customsMark: "2", lines: svc(20_000_00) }, ADMIN);
    const v = createInvoice({ customerId: customer, invoiceDate: "2026-04-02", guiNo: "AB00000004", invoiceFormat: "35", taxType: "1", lines: svc(500_00) }, ADMIN);
    voidInvoice(v, "開立錯誤", ADMIN);
    createArAllowance({ docId: 1, date: "2026-04-10", amount: 1_000_00, reason: "品質折讓" }, ADMIN);

    createBill({ vendorId: vendor, billDate: "2026-03-10", vendorRef: "CD00000001", invoiceFormat: "25", taxType: "1", deductionCode: "1", lines: [{ accountId: acct("6203"), description: "文具", quantity: 1, unitPrice: 4_000_00 }] }, ADMIN);
    createBill({ vendorId: vendor, billDate: "2026-03-11", vendorRef: "CD00000002", invoiceFormat: "21", taxType: "1", deductionCode: "2", lines: [{ accountId: acct("1650"), description: "電腦設備", quantity: 1, unitPrice: 30_000_00 }] }, ADMIN);
    createBill({ vendorId: vendor, billDate: "2026-03-12", vendorRef: "CD00000003", invoiceFormat: "22", taxType: "1", deductionCode: "3", lines: [{ accountId: acct("6209"), description: "餐敘", quantity: 1, unitPrice: 2_000_00 }] }, ADMIN);
    createApAllowance({ docId: 1, date: "2026-04-15", amount: 1_000_00, reason: "退回部分文具" }, ADMIN);
  });

  it("不得扣抵之進項稅額併入費用，不列進項稅額", () => {
    const bill = getBill(3)!;
    expect(bill.tax_amount).toBe(100_00);
    const lines = getVoucherLines(getDb().prepare("SELECT voucher_id FROM ap_bills WHERE id = 3").pluck().get() as number);
    expect(lines.find((l) => l.account_code === "6209")!.debit).toBe(2_100_00);
    expect(lines.some((l) => l.account_code === "1470")).toBe(false);
  });

  it("折讓沖減應收／應付餘額並可作廢", () => {
    expect(getInvoice(1)!.paid_amount).toBe(1_050_00);
    expect(getInvoice(1)!.status).toBe("partial");
    voidArAllowance(1, "重開", ADMIN);
    expect(getInvoice(1)!.paid_amount).toBe(0);
    expect(getInvoice(1)!.status).toBe("open");
    expect(getTrialBalance("2026-01-01", "2026-12-31").balanced).toBe(true);
  });

  it("產生 81 字元媒體申報檔", () => {
    const file = buildMediaFile(P);
    expect(file.filename).toBe("12345678.TXT");
    const lines = file.content.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(9);
    for (const l of lines) expect(l).toHaveLength(81);

    const sale = lines.find((l) => l.slice(39, 49) === "AB00000001" && l.startsWith("35"))!;
    expect(sale.slice(2, 11)).toBe("123456789");
    expect(sale.slice(18, 21)).toBe("115");
    expect(sale.slice(21, 23)).toBe("03");
    expect(sale.slice(23, 31)).toBe("24536806");
    expect(sale.slice(31, 39)).toBe("12345678");
    expect(sale.slice(49, 61)).toBe("000000010000");
    expect(sale[61]).toBe("1");
    expect(sale.slice(62, 72)).toBe("0000000500");
    expect(sale.slice(72)).toBe("         ");

    const b2c = lines.find((l) => l.slice(39, 49) === "AB00000002")!;
    expect(b2c.slice(0, 2)).toBe("32");
    expect(b2c.slice(23, 31)).toBe("        ");

    const zero = lines.find((l) => l.slice(39, 49) === "AB00000003")!;
    expect(zero[61]).toBe("2");
    expect(zero[80]).toBe("2");

    const voided = lines.find((l) => l.slice(39, 49) === "AB00000004")!;
    expect(voided[61]).toBe("F");
    expect(voided.slice(49, 61)).toBe("000000000000");

    const allowance = lines.find((l) => l.startsWith("33"))!;
    expect(allowance.slice(39, 49)).toBe("AB00000001");
    expect(allowance.slice(49, 61)).toBe("000000001000");
    expect(allowance.slice(62, 72)).toBe("0000000050");

    const fixed = lines.find((l) => l.slice(39, 49) === "CD00000002")!;
    expect(fixed.slice(0, 2)).toBe("21");
    expect(fixed.slice(23, 31)).toBe("12345678");
    expect(fixed.slice(31, 39)).toBe("86517413");
    expect(fixed[72]).toBe("2");

    expect(lines.find((l) => l.startsWith("23"))![72]).toBe("1");
    expect(lines.find((l) => l.slice(39, 49) === "CD00000003")![72]).toBe("3");
    // 依格式代號排序，流水號連續
    expect(lines.map((l) => l.slice(0, 2))).toEqual(["21", "22", "23", "25", "31", "32", "33", "35", "35"]);
    expect(lines.map((l) => Number(l.slice(11, 18)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("計算 401：銷項、進項、退稅限額", () => {
    const r = computeVat401(P);
    expect(r.outputTax).toBe(500_00); // 500 + 50 - 50
    expect(r.sales.total.zeroRated).toBe(20_000_00);
    expect(r.sales.zeroRatedCustoms).toBe(20_000_00);
    expect(r.inputTax).toBe(1_650_00); // 200 - 50 + 1,500
    expect(r.purchases.nonDeductible.tax).toBe(100_00);
    expect(r.excess).toBe(1_150_00);
    expect(r.refundLimit).toBe(2_500_00); // 20,000 × 5% + 固定資產 1,500
    expect(r.refund).toBe(1_150_00);
    expect(r.carryOut).toBe(0);
  });

  it("確認申報產生結轉傳票並鎖定期別，可取消", () => {
    fileVatPeriod(P, ADMIN);
    expect(getTrialBalance("2026-01-01", "2026-12-31").balanced).toBe(true);
    expect(() =>
      createInvoice({ customerId: customer, invoiceDate: "2026-04-20", guiNo: "AB00000009", taxType: "1", lines: svc(100_00) }, ADMIN),
    ).toThrow(/已申報/);
    const tb = getTrialBalance("2026-03-01", "2026-04-30");
    const bal = (code: string) => tb.rows.find((r) => r.account.code === code)?.closing ?? 0;
    expect(bal("2204")).toBe(0);
    expect(bal("1470")).toBe(0);
    expect(bal("1200")).toBe(1_150_00);
    unfileVatPeriod(P, ADMIN);
    expect(() =>
      createInvoice({ customerId: customer, invoiceDate: "2026-04-20", guiNo: "AB00000009", taxType: "1", lines: svc(100_00) }, ADMIN),
    ).not.toThrow();
  });

  it("資料不完整時列出問題並拒絕匯出", () => {
    createInvoice({ customerId: customer, invoiceDate: "2026-03-20", taxType: "1", lines: svc(100_00) }, ADMIN);
    expect(collectVatRecords(P).problems[0].message).toMatch(/統一發票號碼/);
    expect(() => buildMediaFile(P)).toThrow(/不完整/);
  });
});

describe("累積留抵", () => {
  it("溢付稅額無零稅率時全數留抵，並帶入下期", () => {
    const { customer, vendor } = setup();
    createBill({ vendorId: vendor, billDate: "2026-01-10", vendorRef: "CD00000001", taxType: "1", lines: [{ accountId: acct("6203"), description: "文具", quantity: 1, unitPrice: 10_000_00 }] }, ADMIN);
    const jan = fileVatPeriod("2026-01", ADMIN);
    expect(jan.carryOut).toBe(500_00);
    expect(jan.refund).toBe(0);
    createInvoice({ customerId: customer, invoiceDate: "2026-03-10", guiNo: "AB00000001", taxType: "1", lines: svc(20_000_00) }, ADMIN);
    const mar = computeVat401("2026-03");
    expect(mar.carryIn).toBe(500_00);
    expect(mar.payable).toBe(500_00); // 1,000 - 500
    fileVatPeriod("2026-03", ADMIN);
    const tb = getTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.account.code === "1480")?.closing ?? 0).toBe(0);
    expect(tb.rows.find((r) => r.account.code === "2205")!.closing).toBe(-500_00);
    expect(() => unfileVatPeriod("2026-01", ADMIN)).toThrow(/最近一期/);
  });

  it("統一發票號碼格式與重複檢查", () => {
    const { customer } = setup();
    expect(() => createInvoice({ customerId: customer, invoiceDate: "2026-03-10", guiNo: "A123", taxType: "1", lines: svc(100_00) }, ADMIN)).toThrow(/字軌/);
    createInvoice({ customerId: customer, invoiceDate: "2026-03-10", guiNo: "ab-00000001", taxType: "1", lines: svc(100_00) }, ADMIN);
    expect(() => createInvoice({ customerId: customer, invoiceDate: "2026-03-11", guiNo: "AB00000001", taxType: "1", lines: svc(100_00) }, ADMIN)).toThrow(/已用於/);
    expect(() => createInvoice({ customerId: customer, invoiceDate: "2026-03-11", taxType: "2", lines: svc(100_00) }, ADMIN)).toThrow(/通關方式/);
  });
});
