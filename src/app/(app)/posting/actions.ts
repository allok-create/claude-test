"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { runAction, str, type ActionState } from "@/lib/action";
import { audit } from "@/lib/services/audit";
import { isAutoPostEnabled, setSetting } from "@/lib/services/settings";
import { postAllDrafts } from "@/lib/services/vouchers";
import { isValidDate } from "@/lib/utils/date";
import { AppError } from "@/lib/utils/errors";

export async function toggleAutoPostAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.post", "admin.settings");
    const enable = str(fd, "enable") === "1";
    const before = isAutoPostEnabled();
    setSetting("posting.auto", enable ? "1" : "0");
    audit(user.id, "update", "setting", "posting.auto", { from: before ? "1" : "0", to: enable ? "1" : "0" });
    revalidatePath("/", "layout");
    return { message: enable ? "已啟用自動過帳" : "已停用自動過帳" };
  });
}

export async function postAllDraftsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.post");
    const from = str(fd, "from");
    const to = str(fd, "to");
    if (from && !isValidDate(from)) throw new AppError("起日格式不正確");
    if (to && !isValidDate(to)) throw new AppError("迄日格式不正確");
    if (from && to && from > to) throw new AppError("起日不得晚於迄日");
    const { posted, failed } = postAllDrafts(user.id, { from: from || undefined, to: to || undefined });
    revalidatePath("/", "layout");
    if (posted.length === 0 && failed.length === 0) return { message: "指定期間內沒有未過帳傳票" };
    const failText = failed.map((f) => `${f.voucherNo}：${f.error}`).join("；");
    if (failed.length > 0) {
      return { error: `已過帳 ${posted.length} 張，失敗 ${failed.length} 張（${failText}）` };
    }
    return { message: `已成功過帳 ${posted.length} 張傳票（${posted.join("、")}）` };
  });
}
