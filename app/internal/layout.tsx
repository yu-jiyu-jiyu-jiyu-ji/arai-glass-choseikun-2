import { AdminHeader } from "@/components/admin-header";

/** 社内画面（認証は次スプリントで middleware 保護予定） */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      {children}
    </div>
  );
}
