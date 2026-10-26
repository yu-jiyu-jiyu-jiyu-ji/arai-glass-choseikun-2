"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";

const NAV = [
  { href: "/admin", label: "ホーム", exact: true },
  { href: "/admin/book", label: "予約調整" },
  { href: "/admin/workers", label: "職人" },
  { href: "/admin/bookings", label: "予約一覧" },
  { href: "/admin/links", label: "URL発行" },
  { href: "/admin/settings", label: "共通設定" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const showBack = pathname !== "/admin";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (href: string, exact?: boolean) => {
    const active = isActive(pathname, href, exact);
    return `block rounded-lg px-3 py-2.5 text-sm font-bold md:py-2 ${
      active ? "bg-blue-50 text-blue-900" : "text-blue-900 hover:bg-blue-50"
    }`;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
        {showBack ? (
          <Link
            href="/admin"
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-1.5 text-sm font-bold text-blue-900 hover:bg-blue-50 sm:px-2"
          >
            <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
            <span>戻る</span>
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-widest text-orange-600">ADMIN</p>
          <p className="truncate text-lg font-bold leading-tight">調整くん（社内）</p>
        </div>

        {/* デスクトップナビ */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="社内メニュー">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href, item.exact)}>
              {item.label}
            </Link>
          ))}
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">
            顧客画面
          </Link>
        </nav>

        {/* モバイル：ハンバーガー */}
        <button
          type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 md:hidden"
          aria-expanded={open}
          aria-controls="admin-mobile-nav"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
          />
          <nav
            id="admin-mobile-nav"
            className="absolute inset-x-0 top-full z-50 border-b border-slate-200 bg-white px-4 py-3 shadow-lg md:hidden"
            aria-label="社内メニュー"
          >
            <ul className="mx-auto max-w-4xl space-y-0.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass(item.href, item.exact)}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/"
                  className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100"
                >
                  顧客画面
                </Link>
              </li>
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
