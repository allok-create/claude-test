"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { int, runAction, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/utils/errors";
import { toCents } from "@/lib/utils/money";
import {
  createVoucher,
  deleteVoucher,
  postVoucher,
  unpostVoucher,
  updateVoucher,
  voidVoucher,
  type VoucherInput,
} from "@/lib/services/vouchers";

const payloadSchema = z.object({
  voucherDate: z.string(),
  voucherType: z.enum(["receipt", "payment", "transfer"]),
  description: z.string().optional(),
  lines: z.array(
    z.object({
      accountId: z.coerce.number().int(),
      description: z.string().optional(),
      debit: z.string(),
      credit: z.string(),
      partner: z.string().optional(), // "customer:1" / "vendor:2"
    }),
  ),
});

function parsePayload(fd: FormData): VoucherInput {
  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, "payload"));
  } catch {
    throw new AppError("傳票資料格式錯誤");
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("傳票資料格式錯誤");
  const p = parsed.data;
  return {
    voucherDate: p.voucherDate,
    voucherType: p.voucherType,
    description: p.description,
    lines: p.lines
      .filter((l) => l.accountId || l.debit || l.credit)
      .map((l, i) => {
        const debit = toCents(l.debit);
        const credit = toCents(l.credit);
        if (Number.isNaN(debit) || Number.isNaN(credit)) throw new AppError(`第 ${i + 1} 列金額格式不正確`);
        const [pt, pid] = (l.partner ?? "").split(":");
        return {
          accountId: l.accountId,
          description: l.description,
          debit,
          credit,
          partnerType: pt === "customer" || pt === "vendor" ? pt : null,
          partnerId: Number(pid) || null,
        };
      }),
  };
}

export async function createVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.create");
    const input = parsePayload(fd);
    // 無過帳權限者，一律存為未過帳
    const autoPost = user.permissions.has("vouchers.post") ? undefined : false;
    const id = createVoucher(input, user.id, { autoPost });
    revalidatePath("/vouchers");
    redirect(`/vouchers/${id}?saved=1`);
  });
}

export async function updateVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.create");
    const id = int(fd, "id");
    updateVoucher(id, parsePayload(fd), user.id);
    revalidatePath("/vouchers");
    redirect(`/vouchers/${id}?saved=1`);
  });
}

export async function postVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.post");
    postVoucher(int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    return { message: "已過帳" };
  });
}

export async function unpostVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.post");
    unpostVoucher(int(fd, "id"), user.id);
    revalidatePath("/", "layout");
    return { message: "已反過帳" };
  });
}

export async function voidVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.void");
    voidVoucher(int(fd, "id"), user.id, str(fd, "reason"));
    revalidatePath("/", "layout");
    return { message: "已作廢" };
  });
}

export async function deleteVoucherAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("vouchers.create");
    deleteVoucher(int(fd, "id"), user.id);
    revalidatePath("/vouchers");
    redirect("/vouchers");
  });
}
