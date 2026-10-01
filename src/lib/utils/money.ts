/** 金額工具：系統內部以「分」整數運算 */

/** 將使用者輸入（元，可含小數或千分位）轉為分 */
export function toCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  const n = typeof input === "number" ? input : Number(String(input).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** 分轉元（數值） */
export function fromCents(cents: number): number {
  return cents / 100;
}

const fmt = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 顯示金額：千分位，負數以括號表示 */
export function formatMoney(cents: number | null | undefined, opts: { blankZero?: boolean; parens?: boolean } = {}): string {
  const v = cents ?? 0;
  if (v === 0 && opts.blankZero) return "";
  const s = fmt.format(Math.abs(v) / 100);
  if (v < 0) return opts.parens === false ? `-${s}` : `(${s})`;
  return s;
}

const qtyFmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
export function formatQty(q: number | null | undefined): string {
  return qtyFmt.format(q ?? 0);
}

/** 計算稅額（四捨五入至元） */
export function calcTax(subtotalCents: number, rate: number): number {
  return Math.round((subtotalCents * rate) / 100) * 100;
}
