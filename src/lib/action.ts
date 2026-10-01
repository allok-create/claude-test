import { unstable_rethrow } from "next/navigation";
import { errorMessage } from "./utils/errors";
import { toCents } from "./utils/money";

/** Server Action 回傳狀態 */
export type ActionState = { error?: string; message?: string };

/**
 * 包裝 Server Action：統一攔截業務錯誤並轉為訊息（redirect 例外照常拋出）。
 */
export async function runAction(fn: () => Promise<ActionState | void> | ActionState | void): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}

/** FormData 讀取工具 */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function int(fd: FormData, key: string): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function num(fd: FormData, key: string): number {
  const n = Number(str(fd, key).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function cents(fd: FormData, key: string): number {
  return toCents(str(fd, key));
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "1" || v === "true";
}

export function optionalId(fd: FormData, key: string): number | null {
  const n = int(fd, key);
  return n > 0 ? n : null;
}
