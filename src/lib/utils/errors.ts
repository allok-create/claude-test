/** 可直接顯示給使用者的業務錯誤 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(message);
}

/** 將例外轉為使用者可讀訊息 */
export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) return "代碼或編號重複，請重新輸入";
  if (e instanceof Error && /FOREIGN KEY constraint failed/.test(e.message)) return "資料已被其他單據引用，無法執行";
  console.error(e);
  return "系統發生錯誤，請稍後再試";
}
