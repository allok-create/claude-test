"use server";

import { requireUser } from "@/lib/auth/session";
import { runAction, type ActionState } from "@/lib/action";
import { changeOwnPassword } from "@/lib/services/users";
import { AppError } from "@/lib/utils/errors";

function raw(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const current = raw(fd, "current");
    const next = raw(fd, "next");
    if (!current) throw new AppError("請輸入目前密碼");
    if (next !== raw(fd, "confirm")) throw new AppError("兩次輸入的新密碼不一致");
    if (next === current) throw new AppError("新密碼不可與目前密碼相同");
    changeOwnPassword(user.id, current, next);
    return { message: "密碼已變更，下次登入請使用新密碼" };
  });
}
