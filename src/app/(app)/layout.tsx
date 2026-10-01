import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { NAVIGATION } from "@/lib/navigation";
import { getCompanyInfo } from "@/lib/services/settings";
import { Sidebar } from "@/components/Sidebar";
import { FirmFooter } from "@/components/FirmFooter";
import { logoutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const company = getCompanyInfo();
  const groups = NAVIGATION.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || user.permissions.has(i.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen">
      <Sidebar groups={groups} companyName={company.name} />
      <div className="lg:pl-60 print:pl-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur print:hidden">
          <Link href="/profile" className="text-sm text-slate-600 hover:text-slate-900">
            {user.displayName}
            <span className="ml-1 text-xs text-slate-400">（{user.roleName}）</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-sm">
              登出
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 print:max-w-none print:p-0">
          {children}
          <div className="print:hidden">
            <FirmFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
