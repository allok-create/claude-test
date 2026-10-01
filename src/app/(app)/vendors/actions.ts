"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { int, runAction, type ActionState } from "@/lib/action";
import { createPartner, deletePartner, updatePartner } from "@/lib/services/partners";
import { readPartnerInput } from "../customers/partner-input";

export async function createVendorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vendors.manage");
    const id = createPartner("vendor", readPartnerInput("vendor", fd), user.id);
    revalidatePath("/", "layout");
    redirect(`/vendors/${id}`);
  });
}

export async function updateVendorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vendors.manage");
    updatePartner("vendor", int(fd, "id"), readPartnerInput("vendor", fd), user.id);
    revalidatePath("/", "layout");
    return { message: "供應商資料已儲存" };
  });
}

export async function deleteVendorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vendors.manage");
    deletePartner("vendor", int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    redirect("/vendors");
  });
}
