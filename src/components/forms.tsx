"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

/** ActionForm 的送出中狀態（因不使用 form action 屬性，useFormStatus 無法取得） */
const PendingContext = createContext(false);

export function SubmitButton({ children, variant = "primary", className = "", pendingText = "處理中…" }: { children: ReactNode; variant?: "primary" | "danger" | "default"; className?: string; pendingText?: string }) {
  const formPending = useFormStatus().pending;
  const pending = useContext(PendingContext) || formPending;
  const cls = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "";
  return (
    <button type="submit" className={`btn ${cls} ${className}`} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state?.error) return <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</div>;
  if (state?.message) return <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</div>;
  return null;
}

/**
 * 包裝 Server Action 的表單：顯示錯誤／成功訊息。
 * 子元素可為一般輸入欄位（由伺服器端元件傳入）。
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.message) ref.current?.reset();
  }, [state, resetOnSuccess]);
  // 以 onSubmit 送出而非 action 屬性：避免 React 於送出後自動清空表單，驗證失敗時保留使用者輸入
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        <FormMessage state={state} />
        {children}
      </PendingContext.Provider>
    </form>
  );
}

/**
 * 單一按鈕操作（過帳、刪除、作廢…），可要求確認或輸入原因。
 */
export function ActionButton({
  action,
  fields = {},
  label,
  confirm,
  promptReason,
  variant = "default",
  size,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string | number>;
  label: string;
  confirm?: string;
  promptReason?: string;
  variant?: "primary" | "danger" | "default";
  size?: "sm";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const reasonRef = useRef<HTMLInputElement>(null);
  const cls = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "";
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (promptReason) {
          const reason = window.prompt(promptReason);
          if (!reason?.trim()) {
            e.preventDefault();
            return;
          }
          if (reasonRef.current) reasonRef.current.value = reason;
        } else if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input ref={reasonRef} type="hidden" name="reason" />
      <button type="submit" className={`btn ${cls} ${size === "sm" ? "btn-sm" : ""}`} disabled={pending}>
        {pending ? "處理中…" : label}
      </button>
      {state?.error && <span className="max-w-xs text-xs text-rose-600">{state.error}</span>}
      {state?.message && <span className="text-xs text-emerald-600">{state.message}</span>}
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      列印
    </button>
  );
}
