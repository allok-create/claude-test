import { beforeEach, describe, expect, it } from "vitest";
import { createInvoice, createReceipt, getArAging, getInvoice, voidInvoice, voidReceipt } from "@/lib/services/receivables";
import { createBill, createPayment, getBill, voidBill } from "@/lib/services/payables";
import { adjustInventory, getProduct } from "@/lib/services/inventory";
import { getTrialBalance, getBalanceSheet, getIncomeStatement } from "@/lib/services/reports";
import { getSubsidiaryLedger } from "@/lib/services/ledger";
import { ADMIN, acct, freshDb, makeCustomer, makeProduct, makeVendor } from "./helpers";

describe("應收、應付與庫存整合", () => {
  let customer: number;
  let vendor: number;
  let product: number;

  beforeEach(() => {
    freshDb();
    customer = makeCustomer();
    vendor = makeVendor();
    product = makeProduct();
  });

  it("進貨入庫：存貨、進項稅額、應付帳款及移動平均成本", () => {
    const billId = createBill(
      { vendorId: vendor, billDate: "2026-01-10", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 10, unitPrice: 100_00 }] },
      ADMIN,
    );
    createBill(
      { vendorId: vendor, billDate: "2026-01-11", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 10, unitPrice: 120_00 }] },
      ADMIN,
    );
    const p = getProduct(product)!;
    expect(p.quantity_on_hand).toBe(20);
    expect(p.average_cost).toBeCloseTo(110_00);
    const bill = getBill(billId)!;
    expect(bill.tax_amount).toBe(50_00);
    expect(bill.total).toBe(1050_00);
    expect(bill.due_date).toBe("2026-02-09");
    const tb = getTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.account.code === "1300")!.closing).toBe(2200_00);
    expect(tb.rows.find((r) => r.account.code === "2170")!.closing).toBe(-2310_00);
  });

  it("銷貨出庫：應收、銷項稅額、銷貨成本，收款沖帳後結清", () => {
    createBill({ vendorId: vendor, billDate: "2026-01-10", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 10, unitPrice: 100_00 }] }, ADMIN);
    const invId = createInvoice(
      { customerId: customer, invoiceDate: "2026-01-20", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 4, unitPrice: 250_00 }] },
      ADMIN,
    );
    const inv = getInvoice(invId)!;
    expect(inv.total).toBe(1050_00);
    expect(getProduct(product)!.quantity_on_hand).toBe(6);

    const is = getIncomeStatement("2026-01-01", "2026-12-31");
    expect(is.revenue.total).toBe(1000_00);
    expect(is.cost.total).toBe(400_00);
    expect(is.grossProfit).toBe(600_00);

    createReceipt({ customerId: customer, receiptDate: "2026-02-01", accountId: acct("1103"), amount: 500_00 }, ADMIN);
    expect(getInvoice(invId)!.status).toBe("partial");
    createReceipt({ customerId: customer, receiptDate: "2026-02-05", accountId: acct("1103"), amount: 550_00 }, ADMIN);
    expect(getInvoice(invId)!.status).toBe("paid");

    const ar = getSubsidiaryLedger(acct("1170"), "2026-01-01", "2026-12-31", { partnerType: "customer", partnerId: customer })!;
    expect(ar.closing).toBe(0);
    expect(getBalanceSheet("2026-12-31").balanced).toBe(true);
  });

  it("收款金額超過未收餘額時拒絕", () => {
    createInvoice({ customerId: customer, invoiceDate: "2026-01-20", taxRate: 0, lines: [{ description: "顧問服務", quantity: 1, unitPrice: 100_00 }] }, ADMIN);
    expect(() => createReceipt({ customerId: customer, receiptDate: "2026-02-01", accountId: acct("1103"), amount: 200_00 }, ADMIN)).toThrow(/不符/);
  });

  it("庫存不足時無法銷貨", () => {
    expect(() =>
      createInvoice({ customerId: customer, invoiceDate: "2026-01-20", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 1, unitPrice: 100_00 }] }, ADMIN),
    ).toThrow(/庫存不足/);
  });

  it("作廢單據回沖庫存與總帳", () => {
    const billId = createBill({ vendorId: vendor, billDate: "2026-01-10", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 10, unitPrice: 100_00 }] }, ADMIN);
    const invId = createInvoice({ customerId: customer, invoiceDate: "2026-01-20", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 3, unitPrice: 200_00 }] }, ADMIN);
    const rcId = createReceipt({ customerId: customer, receiptDate: "2026-01-25", accountId: acct("1101"), amount: 100_00 }, ADMIN);
    expect(() => voidInvoice(invId, "錯誤", ADMIN)).toThrow(/收款/);
    voidReceipt(rcId, "錯誤", ADMIN);
    voidInvoice(invId, "錯誤", ADMIN);
    expect(getProduct(product)!.quantity_on_hand).toBe(10);
    voidBill(billId, "錯誤", ADMIN);
    expect(getProduct(product)!.quantity_on_hand).toBe(0);
    const tb = getTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.totals.closingDebit).toBe(0);
    expect(tb.totals.closingCredit).toBe(0);
  });

  it("付款沖帳與盤點調整", () => {
    createBill({ vendorId: vendor, billDate: "2026-01-10", taxRate: 0.05, lines: [{ productId: product, description: "", quantity: 10, unitPrice: 100_00 }] }, ADMIN);
    createPayment({ vendorId: vendor, paymentDate: "2026-01-31", accountId: acct("1103"), amount: 1050_00 }, ADMIN);
    adjustInventory({ productId: product, date: "2026-02-01", quantity: -2, reason: "盤點短少" }, ADMIN);
    expect(getProduct(product)!.quantity_on_hand).toBe(8);
    const is = getIncomeStatement("2026-01-01", "2026-12-31");
    expect(is.nonOperatingExpense.total).toBe(200_00);
    expect(getTrialBalance("2026-01-01", "2026-12-31").balanced).toBe(true);
  });

  it("帳齡分析依到期日分組", () => {
    createInvoice({ customerId: customer, invoiceDate: "2026-01-01", dueDate: "2026-01-31", taxRate: 0, lines: [{ description: "服務", quantity: 1, unitPrice: 100_00 }] }, ADMIN);
    createInvoice({ customerId: customer, invoiceDate: "2026-03-01", dueDate: "2026-03-31", taxRate: 0, lines: [{ description: "服務", quantity: 1, unitPrice: 300_00 }] }, ADMIN);
    const aging = getArAging("2026-03-15");
    expect(aging.totals.current).toBe(300_00);
    expect(aging.totals.d60).toBe(100_00);
    expect(aging.grandTotal).toBe(400_00);
  });

  it("超過信用額度時拒絕開立", () => {
    const c2 = makeCustomer("C002", { creditLimit: 500_00 });
    expect(() =>
      createInvoice({ customerId: c2, invoiceDate: "2026-01-01", taxRate: 0, lines: [{ description: "服務", quantity: 1, unitPrice: 600_00 }] }, ADMIN),
    ).toThrow(/信用額度/);
  });
});
