"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { bool, num, runAction, str, type ActionState } from "@/lib/action";
import { getDb, tx } from "@/lib/db";
import { ACCOUNT_MAPPING_LABELS } from "@/lib/db/chart-of-accounts";
import { audit } from "@/lib/services/audit";
import { getAllSettings, setSetting } from "@/lib/services/settings";
import { isValidDate } from "@/lib/utils/date";
import { AppError } from "@/lib/utils/errors";

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await authorize("admin.settings");
    const next: Record<string, string> = {
      "company.name": str(fd, "company.name"),
      "company.tax_id": str(fd, "company.tax_id"),
      "company.address": str(fd, "company.address"),
      "company.phone": str(fd, "company.phone"),
      "company.owner": str(fd, "company.owner"),
      "posting.auto": bool(fd, "posting.auto") ? "1" : "0",
      "posting.closing_date": str(fd, "posting.closing_date"),
    };

    if (!next["company.name"]) throw new AppError("請輸入公司名稱");
    if (next["company.tax_id"] && !/^\d{8}$/.test(next["company.tax_id"])) throw new AppError("統一編號須為 8 位數字");
    if (next["posting.closing_date"] && !isValidDate(next["posting.closing_date"])) throw new AppError("關帳日格式不正確");

    const ratePct = num(fd, "tax.default_rate");
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) throw new AppError("預設稅率須介於 0 至 100%");
    next["tax.default_rate"] = String(Math.round(ratePct * 100) / 10000);

    const findAccount = getDb().prepare("SELECT is_detail FROM accounts WHERE code = ?");
    for (const [key, label] of Object.entries(ACCOUNT_MAPPING_LABELS)) {
      const code = str(fd, key);
      if (!code) throw new AppError(`請選擇「${label}」對應科目`);
      const acc = findAccount.get(code) as { is_detail: number } | undefined;
      if (!acc) throw new AppError(`「${label}」對應科目代碼 ${code} 不存在`);
      if (!acc.is_detail) throw new AppError(`「${label}」對應科目 ${code} 須為明細科目`);
      next[key] = code;
    }

    const current = getAllSettings();
    const changes: Record<string, { from: string; to: string }> = {};
    for (const [k, v] of Object.entries(next)) {
      if ((current[k] ?? "") !== v) changes[k] = { from: current[k] ?? "", to: v };
    }
    if (Object.keys(changes).length === 0) return { message: "設定未變更" };

    tx(() => {
      for (const [k, c] of Object.entries(changes)) setSetting(k, c.to);
      audit(user.id, "update", "settings", null, changes);
    });
    revalidatePath("/", "layout");
    return { message: `系統設定已儲存（變更 ${Object.keys(changes).length} 項）` };
  });
}
