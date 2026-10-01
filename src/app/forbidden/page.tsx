import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-bold">權限不足</h1>
        <p className="mt-2 text-sm text-slate-500">您的角色沒有存取此功能的權限，如需使用請洽系統管理員。</p>
        <Link href="/" className="btn btn-primary mt-6">
          回到首頁
        </Link>
      </div>
    </main>
  );
}
