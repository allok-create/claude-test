"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { bool, int, optionalId, runAction, str, type ActionState } from "@/lib/action";
import { createAccount, deleteAccount, updateAccount } from "@/lib/services/accounts";
import type { AccountType } from "@/lib/db/chart-of-accounts";

function readInput(fd: FormData) {
  const normal = str(fd, "normalBalance");
  return {
    name: str(fd, "name"),
    type: str(fd, "type") as AccountType,
    category: str(fd, "category"),
    normalBalance: normal === "debit" || normal === "credit" ? (normal as "debit" | "credit") : undefined,
    description: str(fd, "description") || null,
    isActive: bool(fd, "isActive"),
  };
}

export async function createAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("accounts.manage");
    createAccount({ ...readInput(fd), code: str(fd, "code"), parentId: optionalId(fd, "parentId") }, user.id);
    revalidatePath("/accounts");
    redirect("/accounts");
  });
}

export async function updateAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("accounts.manage");
    updateAccount(int(fd, "id"), readInput(fd), user.id);
    revalidatePath("/accounts");
    redirect("/accounts");
  });
}

export async function deleteAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("accounts.manage");
    deleteAccount(int(fd, "id"), user.id);
    revalidatePath("/accounts");
    redirect("/accounts");
  });
}
