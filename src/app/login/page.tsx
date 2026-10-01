import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanyInfo } from "@/lib/services/settings";
import { FirmFooter } from "@/components/FirmFooter";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "登入" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next = "/" } = await searchParams;
  const company = getCompanyInfo();
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold">企業會計記帳系統</h1>
            <p className="mt-1 text-sm text-slate-500">{company.name}</p>
          </div>
          <LoginForm next={next} />
          <p className="mt-4 text-center text-xs text-slate-400">預設管理員帳號 admin／admin123，首次登入後請立即變更密碼</p>
        </div>
        <div className="mt-4 rounded-lg bg-white/90 px-4 pb-3">
          <FirmFooter />
        </div>
      </div>
    </main>
  );
}
