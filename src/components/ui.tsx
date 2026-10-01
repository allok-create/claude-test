import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/utils/money";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClassName = "p-4" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions && <div className="flex gap-2 print:hidden">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const BADGE_COLORS = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
} as const;

export function Badge({ color = "gray", children }: { color?: keyof typeof BADGE_COLORS; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_COLORS[color]}`}>{children}</span>;
}

const STATUS_COLOR: Record<string, keyof typeof BADGE_COLORS> = {
  draft: "yellow",
  posted: "green",
  void: "gray",
  open: "blue",
  partial: "yellow",
  paid: "green",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge color={STATUS_COLOR[status] ?? "gray"}>{label}</Badge>;
}

export function LinkButton({ href, children, variant = "default", size }: { href: string; children: ReactNode; variant?: "default" | "primary"; size?: "sm" }) {
  return (
    <Link href={href} className={`btn ${variant === "primary" ? "btn-primary" : ""} ${size === "sm" ? "btn-sm" : ""}`}>
      {children}
    </Link>
  );
}

export function Money({ value, blankZero, className = "" }: { value: number; blankZero?: boolean; className?: string }) {
  return <span className={`tabular-nums ${value < 0 ? "text-rose-600" : ""} ${className}`}>{formatMoney(value, { blankZero })}</span>;
}

export function EmptyRow({ colSpan, message = "查無資料" }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-slate-400">
        {message}
      </td>
    </tr>
  );
}

export function StatCard({ label, value, hint, href, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "warn" }) {
  const body = (
    <div className={`card p-4 ${href ? "transition hover:border-brand-500" : ""}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "warn" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "border-brand-100 bg-brand-50 text-brand-900",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

/** 報表表頭：公司名稱、報表名稱、期間（列印時顯示） */
export function ReportTitle({ company, title, period }: { company: string; title: string; period: string }) {
  return (
    <div className="mb-4 text-center">
      <div className="text-lg font-bold">{company}</div>
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm text-slate-500">{period}</div>
      <div className="text-xs text-slate-400">單位：新台幣元</div>
    </div>
  );
}
