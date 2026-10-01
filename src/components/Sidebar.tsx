"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavGroup } from "@/lib/navigation";

function isActive(pathname: string, href: string, allHrefs: string[]) {
  if (href === "/") return pathname === "/";
  if (!(pathname === href || pathname.startsWith(href + "/"))) return false;
  // 若有更精確的選單項目符合，則以該項目為準
  return !allHrefs.some((h) => h !== href && h.startsWith(href + "/") && (pathname === h || pathname.startsWith(h + "/")));
}

export function Sidebar({ groups, companyName }: { groups: NavGroup[]; companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  return (
    <>
      <button
        type="button"
        className="fixed top-3 left-3 z-40 rounded-md bg-brand-900 px-3 py-1.5 text-sm text-white shadow lg:hidden print:hidden"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "關閉選單" : "選單"}
      </button>
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 overflow-y-auto bg-brand-900 text-slate-200 transition-transform lg:translate-x-0 print:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-base font-bold text-white">企業會計記帳系統</div>
          <div className="mt-0.5 truncate text-xs text-slate-400">{companyName}</div>
        </div>
        <nav className="px-3 py-3">
          {groups.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400">{g.title}</div>
              {g.items.map((item) => {
                const active = isActive(pathname, item.href, allHrefs);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-md px-2 py-1.5 text-sm transition ${active ? "bg-white/15 font-semibold text-white" : "hover:bg-white/5 hover:text-white"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
