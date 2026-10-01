"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { bool, cents, int, num, runAction, str, type ActionState } from "@/lib/action";
import { adjustInventory, createProduct, deleteProduct, updateProduct, type ProductInput } from "@/lib/services/inventory";
import { AppError } from "@/lib/utils/errors";

function readProduct(fd: FormData): ProductInput {
  const safety = str(fd, "safetyStock") === "" ? 0 : num(fd, "safetyStock");
  return {
    sku: str(fd, "sku"),
    name: str(fd, "name"),
    unit: str(fd, "unit"),
    category: str(fd, "category") || null,
    salePrice: cents(fd, "salePrice"),
    safetyStock: safety,
    isActive: bool(fd, "isActive"),
  };
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inventory.manage");
    const id = createProduct(readProduct(fd), user.id);
    revalidatePath("/", "layout");
    redirect(`/inventory/products/${id}`);
  });
}

export async function updateProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inventory.manage");
    updateProduct(int(fd, "id"), readProduct(fd), user.id);
    revalidatePath("/", "layout");
    return { message: "商品資料已儲存" };
  });
}

export async function deleteProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inventory.manage");
    deleteProduct(int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    redirect("/inventory");
  });
}

export async function adjustInventoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("inventory.manage");
    const productId = int(fd, "productId");
    if (!productId) throw new AppError("請選擇商品");
    const quantity = num(fd, "quantity");
    if (!Number.isFinite(quantity) || quantity === 0) throw new AppError("請輸入調整數量（正數為盤盈、負數為盤損）");
    const rawCost = str(fd, "unitCost");
    let unitCost: number | undefined;
    if (rawCost !== "") {
      unitCost = cents(fd, "unitCost");
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new AppError("單位成本格式不正確");
      if (quantity < 0) unitCost = undefined; // 盤損一律採平均成本
    }
    const { txnId, voucherId } = adjustInventory(
      { productId, date: str(fd, "date"), quantity, unitCost, reason: str(fd, "reason") },
      user.id,
    );
    revalidatePath("/", "layout");
    redirect(`/inventory/adjust?txn=${txnId}${voucherId ? `&voucher=${voucherId}` : ""}`);
  });
}
