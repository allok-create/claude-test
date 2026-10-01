"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { int, runAction, str, type ActionState } from "@/lib/action";
import { deleteRole, getRole, saveRole } from "@/lib/services/users";

function readRole(fd: FormData) {
  return {
    code: str(fd, "code"),
    name: str(fd, "name"),
    description: str(fd, "description"),
    permissions: fd.getAll("permissions").filter((v): v is string => typeof v === "string"),
  };
}

export async function createRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("admin.roles");
    saveRole(readRole(fd), user.id);
    revalidatePath("/", "layout");
    redirect("/admin/roles");
  });
}

export async function updateRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("admin.roles");
    const id = int(fd, "id");
    const input = readRole(fd);
    // 系統角色代碼不可變更：沿用原代碼通過格式驗證
    const role = getRole(id);
    if (role?.is_system) input.code = role.code;
    saveRole({ ...input, id }, user.id);
    revalidatePath("/", "layout");
    redirect("/admin/roles");
  });
}

export async function deleteRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("admin.roles");
    deleteRole(int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    redirect("/admin/roles");
  });
}
