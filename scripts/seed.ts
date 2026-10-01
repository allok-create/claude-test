/**
 * 建立示範資料
 *   npm run db:seed          於現有資料庫加入示範資料（僅限尚無交易時）
 *   npm run db:reset         刪除資料庫後重建並加入示範資料
 */
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "accounting.db");
process.env.DATABASE_PATH = dbPath;

if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`已刪除資料庫：${dbPath}`);
}

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { getAccountByCode } = await import("../src/lib/services/accounts");
  const { createVoucher } = await import("../src/lib/services/vouchers");
  const { createPartner } = await import("../src/lib/services/partners");
  const { createProduct, adjustInventory } = await import("../src/lib/services/inventory");
  const { createInvoice, createReceipt } = await import("../src/lib/services/receivables");
  const { createBill, createPayment } = await import("../src/lib/services/payables");
  const { createUser, listRoles } = await import("../src/lib/services/users");

  const db = getDb();
  const hasTxn = (db.prepare("SELECT COUNT(*) c FROM vouchers").get() as { c: number }).c > 0;
  if (hasTxn) {
    console.log("資料庫已有傳票資料，略過示範資料。若要重建請執行 npm run db:reset");
    return;
  }

  const ADMIN = 1;
  const year = new Date().getFullYear();
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const acct = (code: string) => {
    const a = getAccountByCode(code);
    if (!a) throw new Error(`科目 ${code} 不存在`);
    return a.id;
  };
  const yuan = (n: number) => Math.round(n * 100);

  // 使用者
  const roles = listRoles();
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  createUser({ username: "chief", displayName: "王會計主管", roleId: roleId("chief_accountant"), password: "Chief12345", isActive: true }, ADMIN);
  createUser({ username: "accountant", displayName: "林會計", roleId: roleId("accountant"), password: "Account123", isActive: true }, ADMIN);
  createUser({ username: "viewer", displayName: "陳查詢", roleId: roleId("viewer"), password: "Viewer1234", isActive: true }, ADMIN);

  // 往來對象
  const c1 = createPartner("customer", { code: "C001", name: "大成科技股份有限公司", taxId: "24536806", contactPerson: "張經理", phone: "02-27001234", email: "ap@dacheng.example.com", address: "台北市信義區松仁路100號", paymentTermsDays: 30, creditLimit: yuan(2_000_000), isActive: true }, ADMIN);
  const c2 = createPartner("customer", { code: "C002", name: "綠野貿易有限公司", taxId: "53212539", contactPerson: "李小姐", phone: "04-23281234", address: "台中市西屯區台灣大道三段99號", paymentTermsDays: 60, isActive: true }, ADMIN);
  const c3 = createPartner("customer", { code: "C003", name: "晨光設計工作室", contactPerson: "黃先生", phone: "0912-345-678", paymentTermsDays: 15, isActive: true }, ADMIN);
  const v1 = createPartner("vendor", { code: "V001", name: "聯合電子材料股份有限公司", taxId: "86517413", contactPerson: "吳業務", phone: "03-5781234", paymentTermsDays: 30, bankAccount: "台灣銀行 012-345678-9", isActive: true }, ADMIN);
  const v2 = createPartner("vendor", { code: "V002", name: "文心大樓管理顧問有限公司", taxId: "28495301", phone: "04-22410000", paymentTermsDays: 0, isActive: true }, ADMIN);
  const v3 = createPartner("vendor", { code: "V003", name: "快捷物流股份有限公司", taxId: "97162640", phone: "02-26581234", paymentTermsDays: 30, isActive: true }, ADMIN);

  // 商品
  const p1 = createProduct({ sku: "NB-14", name: "14 吋商務筆電", unit: "台", category: "電腦", salePrice: yuan(32000), safetyStock: 5, isActive: true }, ADMIN);
  const p2 = createProduct({ sku: "MON-27", name: "27 吋顯示器", unit: "台", category: "周邊", salePrice: yuan(8500), safetyStock: 10, isActive: true }, ADMIN);
  const p3 = createProduct({ sku: "KB-01", name: "無線鍵盤滑鼠組", unit: "組", category: "周邊", salePrice: yuan(1200), safetyStock: 30, isActive: true }, ADMIN);
  const p4 = createProduct({ sku: "DOCK-USB", name: "USB-C 擴充基座", unit: "個", category: "周邊", salePrice: yuan(2800), safetyStock: 20, isActive: true }, ADMIN);

  // 期初開帳
  createVoucher(
    {
      voucherDate: d(1, 1),
      voucherType: "transfer",
      description: "期初開帳",
      lines: [
        { accountId: acct("1101"), debit: yuan(50_000), credit: 0 },
        { accountId: acct("1103"), debit: yuan(5_000_000), credit: 0 },
        { accountId: acct("1650"), debit: yuan(450_000), credit: 0 },
        { accountId: acct("1690"), debit: 0, credit: yuan(90_000) },
        { accountId: acct("3110"), debit: 0, credit: yuan(5_000_000) },
        { accountId: acct("3350"), debit: 0, credit: yuan(410_000) },
      ],
    },
    ADMIN,
    { autoPost: true },
  );

  // 進貨
  createBill({ vendorId: v1, billDate: d(1, 8), vendorRef: "AB12345678", taxRate: 0.05, lines: [
    { productId: p1, description: "", quantity: 20, unitPrice: yuan(24000) },
    { productId: p2, description: "", quantity: 30, unitPrice: yuan(6000) },
    { productId: p3, description: "", quantity: 100, unitPrice: yuan(700) },
  ] }, ADMIN);
  createBill({ vendorId: v1, billDate: d(3, 12), vendorRef: "AB12345901", taxRate: 0.05, lines: [
    { productId: p1, description: "", quantity: 10, unitPrice: yuan(24500) },
    { productId: p4, description: "", quantity: 50, unitPrice: yuan(1800) },
  ] }, ADMIN);

  // 每月租金與費用
  for (let m = 1; m <= 9; m++) {
    createBill({ vendorId: v2, billDate: d(m, 5), dueDate: d(m, 10), vendorRef: `RT${year}${String(m).padStart(2, "0")}`, description: `${m} 月份辦公室租金`, taxRate: 0.05, lines: [
      { accountId: acct("6202"), description: `${m} 月份辦公室租金`, quantity: 1, unitPrice: yuan(30000) },
    ] }, ADMIN);
    createPayment({ vendorId: v2, paymentDate: d(m, 10), accountId: acct("1103"), amount: yuan(31500), description: `${m} 月租金` }, ADMIN);
    // 每月維護服務收入與收款
    createInvoice({ customerId: c1, invoiceDate: d(m, 1), guiNo: `AB${String(m).padStart(8, "0")}`, description: `${m} 月份系統維護服務`, taxRate: 0.05, lines: [
      { accountId: acct("4600"), description: `${m} 月份系統維護服務`, quantity: 1, unitPrice: yuan(120_000) },
    ] }, ADMIN);
    if (m < 9) createReceipt({ customerId: c1, receiptDate: d(m, 25), accountId: acct("1103"), amount: yuan(126_000), description: `${m} 月維護費` }, ADMIN);
    createVoucher({
      voucherDate: d(m, 28),
      voucherType: "payment",
      description: `${m} 月份薪資`,
      lines: [
        { accountId: acct("6201"), debit: yuan(90_000), credit: 0, description: "管理部門薪資" },
        { accountId: acct("2280"), debit: 0, credit: yuan(4_500), description: "代扣勞健保及所得稅" },
        { accountId: acct("1103"), debit: 0, credit: yuan(85_500), description: "薪資轉帳" },
      ],
    }, ADMIN, { autoPost: true });
    createVoucher({
      voucherDate: d(m, 20),
      voucherType: "payment",
      description: `${m} 月份水電費`,
      lines: [
        { accountId: acct("6207"), debit: yuan(8_200 + m * 150), credit: 0 },
        { accountId: acct("1470"), debit: yuan(410), credit: 0 },
        { accountId: acct("1103"), debit: 0, credit: yuan(8_200 + m * 150 + 410) },
      ],
    }, ADMIN, { autoPost: true });
  }

  // 銷貨
  const sales: [number, number, string, [number, number, number][]][] = [
    [c1, 2, "AA00000101", [[p1, 8, 32000], [p2, 8, 8500], [p3, 8, 1200]]],
    [c2, 3, "AA00000102", [[p2, 10, 8300], [p3, 40, 1150]]],
    [c1, 5, "AA00000103", [[p1, 10, 31500], [p4, 10, 2800]]],
    [c3, 6, "AA00000104", [[p3, 20, 1200], [p4, 15, 2700]]],
    [c2, 8, "AA00000105", [[p1, 6, 32000], [p2, 6, 8500]]],
  ];
  sales.forEach(([customerId, m, gui, items]) => {
    createInvoice({ customerId, invoiceDate: d(m, 15), guiNo: gui, taxRate: 0.05, lines: items.map(([productId, quantity, price]) => ({ productId, description: "", quantity, unitPrice: yuan(price) })) }, ADMIN);
  });
  createInvoice({ customerId: c3, invoiceDate: d(9, 3), guiNo: "AA00000106", description: "系統導入顧問服務", taxRate: 0.05, lines: [
    { accountId: acct("4600"), description: "系統導入顧問服務", quantity: 1, unitPrice: yuan(120_000) },
  ] }, ADMIN);

  // 收款與付款
  createReceipt({ customerId: c1, receiptDate: d(3, 15), accountId: acct("1103"), amount: yuan(350_280), description: "電匯" }, ADMIN);
  createReceipt({ customerId: c2, receiptDate: d(5, 30), accountId: acct("1103"), amount: yuan(135_450) }, ADMIN);
  createReceipt({ customerId: c1, receiptDate: d(6, 20), accountId: acct("1103"), amount: yuan(200_000) }, ADMIN);
  createPayment({ vendorId: v1, paymentDate: d(2, 7), accountId: acct("1103"), amount: yuan(766_500) }, ADMIN);
  createPayment({ vendorId: v1, paymentDate: d(4, 10), accountId: acct("1103"), amount: yuan(300_000) }, ADMIN);

  // 運費
  createBill({ vendorId: v3, billDate: d(8, 20), taxRate: 0.05, description: "出貨運費", lines: [
    { accountId: acct("6120"), description: "八月份出貨運費", quantity: 1, unitPrice: yuan(12_000) },
  ] }, ADMIN);

  // 折舊、盤點
  createVoucher({
    voucherDate: d(6, 30),
    voucherType: "transfer",
    description: "上半年度辦公設備折舊",
    lines: [
      { accountId: acct("6211"), debit: yuan(45_000), credit: 0 },
      { accountId: acct("1690"), debit: 0, credit: yuan(45_000) },
    ],
  }, ADMIN, { autoPost: true });
  adjustInventory({ productId: p3, date: d(6, 30), quantity: -2, reason: "年中盤點短少" }, ADMIN);

  // 一張未過帳的草稿傳票
  createVoucher({
    voucherDate: d(9, 25),
    voucherType: "payment",
    description: "員工聚餐（待主管核准）",
    lines: [
      { accountId: acct("6213"), debit: yuan(15_000), credit: 0 },
      { accountId: acct("1101"), debit: 0, credit: yuan(15_000) },
    ],
  }, ADMIN, { autoPost: false });

  console.log("示範資料建立完成。");
  console.log("登入帳號：admin／admin123（系統管理員）、chief／Chief12345、accountant／Account123、viewer／Viewer1234");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
