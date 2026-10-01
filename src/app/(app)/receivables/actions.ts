"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { int, runAction, str, type ActionState } from "@/lib/action";
import { createInvoice, createReceipt, voidInvoice, voidReceipt } from "@/lib/services/receivables";
import { parseSettlementPayload, parseTradePayload } from "./payload";

export async function createInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ar.manage");
    const p = parseTradePayload(fd);
    const id = createInvoice(
      {
        customerId: p.partnerId,
        invoiceDate: p.docDate,
        dueDate: p.dueDate,
        guiNo: p.ref,
        description: p.description,
        taxRate: p.taxRate,
        lines: p.lines,
      },
      user.id,
    );
    revalidatePath("/", "layout");
    redirect(`/receivables/${id}?saved=1`);
  });
}

export async function voidInvoiceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ar.manage");
    voidInvoice(int(fd, "id"), str(fd, "reason"), user.id);
    revalidatePath("/", "layout");
    return { message: "應收單已作廢" };
  });
}

export async function createReceiptAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ar.manage");
    const p = parseSettlementPayload(fd);
    createReceipt(
      {
        customerId: p.partnerId,
        receiptDate: p.date,
        accountId: p.accountId,
        amount: p.amount,
        description: p.description,
        allocations: p.allocations.map((a) => ({ invoiceId: a.docId, amount: a.amount })),
      },
      user.id,
    );
    revalidatePath("/", "layout");
    redirect("/receivables/receipts?saved=1");
  });
}

export async function voidReceiptAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ar.manage");
    voidReceipt(int(fd, "id"), str(fd, "reason"), user.id);
    revalidatePath("/", "layout");
    return { message: "收款單已作廢" };
  });
}
