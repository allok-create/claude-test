import { getDb, tx, type DB } from "../db";
import { AppError, assert } from "../utils/errors";
import { isValidDate } from "../utils/date";
import { audit } from "./audit";
import { nextNumber } from "./sequences";
import { getMappedAccountId } from "./settings";
import { createVoucher } from "./vouchers";

/**
 * 庫存管理：商品主檔、進出庫異動、移動加權平均成本、盤點調整。
 */

export type Product = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  sale_price: number;
  quantity_on_hand: number;
  average_cost: number;
  safety_stock: number;
  is_active: number;
  created_at: string;
};

export type InventoryTxnType = "opening" | "purchase" | "sale" | "adjust_in" | "adjust_out" | "purchase_void" | "sale_void";

export const TXN_TYPE_LABELS: Record<InventoryTxnType, string> = {
  opening: "期初",
  purchase: "進貨入庫",
  sale: "銷貨出庫",
  adjust_in: "盤盈調整",
  adjust_out: "盤損調整",
  purchase_void: "進貨作廢",
  sale_void: "銷貨作廢",
};

export type ProductInput = {
  sku: string;
  name: string;
  unit: string;
  category?: string | null;
  salePrice: number; // 分
  safetyStock: number;
  isActive: boolean;
};

function validateProduct(input: ProductInput) {
  assert(/^[0-9A-Za-z_-]{1,30}$/.test(input.sku), "商品編號須為 1–30 碼英數字");
  assert(input.name.trim(), "請輸入商品名稱");
  assert(input.unit.trim(), "請輸入單位");
  assert(Number.isInteger(input.salePrice) && input.salePrice >= 0, "售價不可為負數");
  assert(Number.isFinite(input.safetyStock) && input.safetyStock >= 0, "安全存量不可為負數");
}

export function listProducts(opts: { q?: string; activeOnly?: boolean; lowStockOnly?: boolean } = {}): Product[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.activeOnly) where.push("is_active = 1");
  if (opts.lowStockOnly) where.push("quantity_on_hand <= safety_stock AND safety_stock > 0");
  if (opts.q) {
    where.push("(sku LIKE ? OR name LIKE ? OR category LIKE ?)");
    params.push(`%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`);
  }
  return getDb()
    .prepare(`SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY sku`)
    .all(...params) as Product[];
}

export function getProduct(id: number): Product | undefined {
  return getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
}

export function createProduct(input: ProductInput, userId: number): number {
  validateProduct(input);
  const { lastInsertRowid } = getDb()
    .prepare(
      "INSERT INTO products (sku, name, unit, category, sale_price, safety_stock, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.sku, input.name.trim(), input.unit.trim(), input.category || null, input.salePrice, input.safetyStock, input.isActive ? 1 : 0);
  audit(userId, "create", "product", Number(lastInsertRowid), { sku: input.sku, name: input.name });
  return Number(lastInsertRowid);
}

export function updateProduct(id: number, input: ProductInput, userId: number) {
  validateProduct(input);
  assert(getProduct(id), "商品不存在");
  getDb()
    .prepare("UPDATE products SET sku = ?, name = ?, unit = ?, category = ?, sale_price = ?, safety_stock = ?, is_active = ? WHERE id = ?")
    .run(input.sku, input.name.trim(), input.unit.trim(), input.category || null, input.salePrice, input.safetyStock, input.isActive ? 1 : 0, id);
  audit(userId, "update", "product", id, { sku: input.sku, name: input.name });
}

export function deleteProduct(id: number, userId: number) {
  const db = getDb();
  const p = getProduct(id);
  assert(p, "商品不存在");
  const used =
    db.prepare("SELECT 1 FROM inventory_transactions WHERE product_id = ? LIMIT 1").get(id) ||
    db.prepare("SELECT 1 FROM ar_invoice_lines WHERE product_id = ? LIMIT 1").get(id) ||
    db.prepare("SELECT 1 FROM ap_bill_lines WHERE product_id = ? LIMIT 1").get(id);
  if (used) throw new AppError("此商品已有異動紀錄，無法刪除，請改為停用");
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  audit(userId, "delete", "product", id, { sku: p.sku });
}

export type StockMovement = {
  productId: number;
  date: string;
  type: InventoryTxnType;
  quantity: number; // 入庫為正、出庫為負
  unitCost?: number; // 未指定時：入庫須提供；出庫採目前平均成本
  sourceType?: string;
  sourceId?: number;
  voucherId?: number | null;
  description?: string;
  userId: number;
  txnNo?: string;
};

/**
 * 記錄庫存異動並更新移動加權平均成本，回傳異動成本（分，入庫為正、出庫為負）。
 * 須在交易中呼叫。
 */
export function recordStockMovement(db: DB, m: StockMovement): { totalCost: number; txnId: number } {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(m.productId) as Product | undefined;
  assert(p, "商品不存在");
  assert(Number.isFinite(m.quantity) && m.quantity !== 0, "異動數量不可為 0");
  const qoh = p.quantity_on_hand;
  const currentValue = qoh * p.average_cost;
  let totalCost: number;
  if (m.quantity > 0) {
    const unitCost = m.unitCost ?? p.average_cost;
    assert(unitCost >= 0, "單位成本不可為負數");
    totalCost = Math.round(m.quantity * unitCost);
  } else {
    if (qoh + m.quantity < -1e-9) {
      throw new AppError(`「${p.sku} ${p.name}」庫存不足：現有 ${qoh}，欲出庫 ${-m.quantity}`);
    }
    const unitCost = m.unitCost ?? p.average_cost;
    totalCost = -Math.round(-m.quantity * unitCost);
  }
  const newQty = Math.round((qoh + m.quantity) * 10000) / 10000;
  const newValue = currentValue + totalCost;
  const newAvg = newQty > 0 ? Math.max(0, newValue / newQty) : p.average_cost;

  db.prepare("UPDATE products SET quantity_on_hand = ?, average_cost = ? WHERE id = ?").run(newQty, newAvg, p.id);
  const txnNo = m.txnNo ?? nextNumber("IV", m.date.slice(0, 7).replace("-", ""));
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO inventory_transactions
        (txn_no, product_id, txn_date, txn_type, quantity, unit_cost, total_cost, balance_qty, balance_avg_cost, source_type, source_id, voucher_id, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      txnNo,
      p.id,
      m.date,
      m.type,
      m.quantity,
      Math.abs(totalCost / m.quantity),
      totalCost,
      newQty,
      newAvg,
      m.sourceType ?? null,
      m.sourceId ?? null,
      m.voucherId ?? null,
      m.description ?? null,
      m.userId,
    );
  return { totalCost, txnId: Number(lastInsertRowid) };
}

export type AdjustmentInput = {
  productId: number;
  date: string;
  quantity: number; // 正數盤盈、負數盤損
  unitCost?: number; // 盤盈時之單位成本（分），未填採平均成本
  reason: string;
};

/** 盤點調整：異動庫存並自動產生、過帳調整傳票 */
export function adjustInventory(input: AdjustmentInput, userId: number) {
  assert(isValidDate(input.date), "日期格式不正確");
  assert(input.reason.trim(), "請輸入調整原因");
  return tx((db) => {
    const p = getProduct(input.productId);
    assert(p, "商品不存在");
    const type: InventoryTxnType = input.quantity > 0 ? "adjust_in" : "adjust_out";
    if (type === "adjust_in" && input.unitCost === undefined) {
      assert(p.average_cost > 0, "此商品尚無平均成本，盤盈時請輸入單位成本");
    }
    const txnNo = nextNumber("IV", input.date.slice(0, 7).replace("-", ""));
    const { totalCost, txnId } = recordStockMovement(db, {
      productId: p.id,
      date: input.date,
      type,
      quantity: input.quantity,
      unitCost: input.unitCost,
      sourceType: "adjustment",
      description: input.reason,
      userId,
      txnNo,
    });
    let voucherId: number | null = null;
    const amount = Math.abs(totalCost);
    if (amount > 0) {
      const inv = getMappedAccountId("acct.inventory");
      const desc = `${TXN_TYPE_LABELS[type]} ${p.sku} ${p.name}（${input.reason.trim()}）`;
      const lines =
        type === "adjust_in"
          ? [
              { accountId: inv, debit: amount, credit: 0, description: desc },
              { accountId: getMappedAccountId("acct.inventory_gain"), debit: 0, credit: amount, description: desc },
            ]
          : [
              { accountId: getMappedAccountId("acct.inventory_loss"), debit: amount, credit: 0, description: desc },
              { accountId: inv, debit: 0, credit: amount, description: desc },
            ];
      voucherId = createVoucher(
        { voucherDate: input.date, voucherType: "transfer", description: `庫存調整 ${txnNo}`, lines, source: "inventory", sourceId: txnId },
        userId,
        { autoPost: true },
      );
      db.prepare("UPDATE inventory_transactions SET voucher_id = ? WHERE id = ?").run(voucherId, txnId);
    }
    audit(userId, "adjust", "inventory", txnId, { sku: p.sku, quantity: input.quantity, reason: input.reason });
    return { txnId, voucherId };
  });
}

export type InventoryTxnRow = {
  id: number;
  txn_no: string;
  txn_date: string;
  txn_type: InventoryTxnType;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  balance_qty: number;
  balance_avg_cost: number;
  source_type: string | null;
  source_id: number | null;
  voucher_id: number | null;
  description: string | null;
};

export function listInventoryTransactions(filter: { productId?: number; from?: string; to?: string; limit?: number } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.productId) {
    where.push("t.product_id = ?");
    params.push(filter.productId);
  }
  if (filter.from) {
    where.push("t.txn_date >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("t.txn_date <= ?");
    params.push(filter.to);
  }
  return getDb()
    .prepare(
      `SELECT t.*, p.sku, p.name product_name, p.unit FROM inventory_transactions t
       JOIN products p ON p.id = t.product_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY t.id DESC LIMIT ?`,
    )
    .all(...params, filter.limit ?? 500) as InventoryTxnRow[];
}

export function getInventoryValuation() {
  const rows = listProducts();
  const items = rows.map((p) => ({ ...p, value: Math.round(p.quantity_on_hand * p.average_cost) }));
  return { items, totalValue: items.reduce((s, i) => s + i.value, 0) };
}
