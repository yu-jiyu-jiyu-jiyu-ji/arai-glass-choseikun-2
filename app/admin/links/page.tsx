"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 互換: /admin/links → /internal/links */
export default function AdminLinksRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/internal/links");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20 text-slate-600">
      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
      URL発行へ移動中…
    </div>
  );
}
