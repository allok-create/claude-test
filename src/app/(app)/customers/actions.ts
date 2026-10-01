"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { int, runAction, type ActionState } from "@/lib/action";
import { createPartner, deletePartner, updatePartner } from "@/lib/services/partners";
import { readPartnerInput } from "./partner-input";

export async function createCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("customers.manage");
    const id = createPartner("customer", readPartnerInput("customer", fd), user.id);
    revalidatePath("/", "layout");
    redirect(`/customers/${id}`);
  });
}

export async function updateCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("customers.manage");
    updatePartner("customer", int(fd, "id"), readPartnerInput("customer", fd), user.id);
    revalidatePath("/", "layout");
    return { message: "客戶資料已儲存" };
  });
}

export async function deleteCustomerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("customers.manage");
    deletePartner("customer", int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    redirect("/customers");
  });
}
