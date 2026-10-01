"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { int, runAction, str, type ActionState } from "@/lib/action";
import { createBill, createPayment, voidBill, voidPayment } from "@/lib/services/payables";
import { parseSettlementPayload, parseTradePayload } from "../receivables/payload";

export async function createBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ap.manage");
    const p = parseTradePayload(fd);
    const id = createBill(
      {
        vendorId: p.partnerId,
        billDate: p.docDate,
        dueDate: p.dueDate,
        vendorRef: p.ref,
        description: p.description,
        taxRate: p.taxRate,
        lines: p.lines,
      },
      user.id,
    );
    revalidatePath("/", "layout");
    redirect(`/payables/${id}?saved=1`);
  });
}

export async function voidBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ap.manage");
    voidBill(int(fd, "id"), str(fd, "reason"), user.id);
    revalidatePath("/", "layout");
    return { message: "應付單已作廢" };
  });
}

export async function createPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ap.manage");
    const p = parseSettlementPayload(fd);
    createPayment(
      {
        vendorId: p.partnerId,
        paymentDate: p.date,
        accountId: p.accountId,
        amount: p.amount,
        description: p.description,
        allocations: p.allocations.map((a) => ({ billId: a.docId, amount: a.amount })),
      },
      user.id,
    );
    revalidatePath("/", "layout");
    redirect("/payables/payments?saved=1");
  });
}

export async function voidPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("ap.manage");
    voidPayment(int(fd, "id"), str(fd, "reason"), user.id);
    revalidatePath("/", "layout");
    return { message: "付款單已作廢" };
  });
}
