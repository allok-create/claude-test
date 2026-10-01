import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-bold">找不到資料</h1>
        <p className="mt-2 text-sm text-slate-500">您要查詢的頁面或單據不存在，可能已被刪除。</p>
        <Link href="/" className="btn btn-primary mt-6">
          回到首頁
        </Link>
      </div>
    </main>
  );
}
