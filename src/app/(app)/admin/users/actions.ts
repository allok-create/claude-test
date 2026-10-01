"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { bool, int, runAction, str, type ActionState } from "@/lib/action";
import { createUser, updateUser } from "@/lib/services/users";
import { AppError } from "@/lib/utils/errors";

function checkEmail(email: string) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("電子郵件格式不正確");
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await authorize("admin.users");
    const email = str(fd, "email");
    checkEmail(email);
    const password = str(fd, "password");
    if (password !== str(fd, "confirm")) throw new AppError("兩次輸入的密碼不一致");
    createUser(
      {
        username: str(fd, "username"),
        displayName: str(fd, "displayName"),
        email: email || undefined,
        roleId: int(fd, "roleId"),
        password,
        isActive: bool(fd, "isActive"),
      },
      actor.id,
    );
    revalidatePath("/", "layout");
    redirect("/admin/users");
  });
}

export async function updateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await authorize("admin.users");
    const email = str(fd, "email");
    checkEmail(email);
    const password = str(fd, "password");
    if (password && password !== str(fd, "confirm")) throw new AppError("兩次輸入的密碼不一致");
    updateUser(
      int(fd, "id"),
      {
        displayName: str(fd, "displayName"),
        email: email || undefined,
        roleId: int(fd, "roleId"),
        isActive: bool(fd, "isActive"),
        password: password || undefined,
      },
      actor.id,
    );
    revalidatePath("/", "layout");
    redirect("/admin/users");
  });
}
