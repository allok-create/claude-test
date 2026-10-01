"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</div>}
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">帳號</span>
        <input name="username" className="input" autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="label">密碼</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button type="submit" className="btn btn-primary w-full py-2" disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
