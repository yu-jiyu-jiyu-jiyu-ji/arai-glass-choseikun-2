import type { ReactNode } from "react";
import { AdminCacheWarmer } from "@/components/admin-cache-warmer";
import { AdminHeader } from "@/components/admin-header";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AdminCacheWarmer />
      <AdminHeader />
      {children}
    </div>
  );
}
