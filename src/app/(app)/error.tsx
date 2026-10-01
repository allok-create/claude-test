"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-bold">頁面發生錯誤</h1>
      <p className="mt-2 text-sm text-slate-500">系統處理時發生未預期的錯誤，請稍後再試；若持續發生請聯絡系統管理員。</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">錯誤代碼：{error.digest}</p>}
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        重新嘗試
      </button>
    </div>
  );
}
