import { z } from "zod";
import { str } from "@/lib/action";
import { AppError } from "@/lib/utils/errors";
import { toCents } from "@/lib/utils/money";
import type { TradeLineInput } from "@/lib/services/receivables";

/**
 * 解析 TradeDocForm／SettlementForm 送出之 JSON payload（應收、應付共用）。
 * 金額欄位為「元」字串，於此轉為「分」。
 */

const tradeSchema = z.object({
  partnerId: z.coerce.number().int(),
  docDate: z.string(),
  dueDate: z.string().nullish(),
  ref: z.string().nullish(),
  description: z.string().nullish(),
  taxRate: z.coerce.number(),
  lines: z.array(
    z.object({
      productId: z.coerce.number().int().nullish(),
      accountId: z.coerce.number().int().nullish(),
      description: z.string(),
      quantity: z.string(),
      unitPrice: z.string(),
    }),
  ),
});

function readJson(fd: FormData): unknown {
  try {
    return JSON.parse(str(fd, "payload"));
  } catch {
    throw new AppError("表單資料格式錯誤");
  }
}

export function parseTradePayload(fd: FormData) {
  const parsed = tradeSchema.safeParse(readJson(fd));
  if (!parsed.success) throw new AppError("表單資料格式錯誤");
  const p = parsed.data;
  const lines: TradeLineInput[] = p.lines.map((l, i) => {
    const quantity = Number(l.quantity.replace(/,/g, ""));
    const unitPrice = toCents(l.unitPrice);
    if (!Number.isFinite(quantity)) throw new AppError(`第 ${i + 1} 列數量格式不正確`);
    if (Number.isNaN(unitPrice)) throw new AppError(`第 ${i + 1} 列單價格式不正確`);
    return {
      productId: l.productId || null,
      accountId: l.productId ? null : l.accountId || null,
      description: l.description,
      quantity,
      unitPrice,
    };
  });
  return {
    partnerId: p.partnerId,
    docDate: p.docDate,
    dueDate: p.dueDate || null,
    ref: p.ref?.trim() || null,
    description: p.description?.trim() || null,
    taxRate: p.taxRate,
    lines,
  };
}

const settlementSchema = z.object({
  partnerId: z.coerce.number().int(),
  date: z.string(),
  accountId: z.coerce.number().int(),
  description: z.string().nullish(),
  amount: z.string().nullish(),
  allocations: z.array(z.object({ docId: z.coerce.number().int(), amount: z.string() })),
});

export function parseSettlementPayload(fd: FormData) {
  const parsed = settlementSchema.safeParse(readJson(fd));
  if (!parsed.success) throw new AppError("表單資料格式錯誤");
  const p = parsed.data;
  const allocations = p.allocations
    .map((a) => {
      const amount = toCents(a.amount);
      if (Number.isNaN(amount) || amount < 0) throw new AppError("沖銷金額格式不正確");
      return { docId: a.docId, amount };
    })
    .filter((a) => a.amount > 0);
  let amount: number;
  if (allocations.length > 0) {
    amount = allocations.reduce((s, a) => s + a.amount, 0);
  } else {
    amount = toCents(p.amount ?? "");
    if (Number.isNaN(amount)) throw new AppError("金額格式不正確");
  }
  return {
    partnerId: p.partnerId,
    date: p.date,
    accountId: p.accountId,
    description: p.description?.trim() || null,
    amount,
    allocations,
  };
}
