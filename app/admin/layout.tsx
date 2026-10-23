import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/book", label: "予約調整" },
  { href: "/admin/workers", label: "職人" },
  { href: "/admin/bookings", label: "予約一覧" },
  { href: "/admin/links", label: "URL発行" },
  { href: "/admin/settings", label: "共通設定" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-orange-600">ADMIN</p>
            <p className="text-lg font-bold">調整くん（社内）</p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm font-bold">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-blue-900 hover:bg-blue-50"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/" className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">
              顧客画面
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
