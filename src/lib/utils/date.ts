/** 日期工具：統一以 YYYY-MM-DD 字串表示，時區為 Asia/Taipei */

export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
}

export function nowTimestamp(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function startOfYear(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

/** 民國年顯示，例：115/10/01 */
export function toRocDate(date: string | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${Number(y) - 1911}/${m}/${d}`;
}
