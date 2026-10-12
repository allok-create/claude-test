"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { runAction, str, type ActionState } from "@/lib/action";
import { fileVatPeriod, unfileVatPeriod, vatPeriodLabel } from "@/lib/services/vat";
import { formatMoney } from "@/lib/utils/money";

export async function fileVatAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("tax.file");
    const period = str(fd, "period");
    const r = fileVatPeriod(period, user.id);
    revalidatePath("/", "layout");
    const result =
      r.payable > 0
        ? `本期應實繳稅額 ${formatMoney(r.payable)} 元`
        : `本期應退稅額 ${formatMoney(r.refund)} 元、累積留抵稅額 ${formatMoney(r.carryOut)} 元`;
    return { message: `${vatPeriodLabel(period)}已確認申報：${result}` };
  });
}

export async function unfileVatAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("tax.file");
    unfileVatPeriod(str(fd, "period"), user.id);
    revalidatePath("/", "layout");
    return { message: "已取消申報，結轉傳票已作廢" };
  });
}
