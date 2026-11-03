"use client";

import { Suspense, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 互換: /r/[token] → /reserve?token= */
function RedirectInner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/reserve?token=${encodeURIComponent(token)}`);
  }, [router, token]);
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-600">
      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
      予約画面へ移動中…
    </div>
  );
}

export default function LegacyTokenRedirect({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-slate-600">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        </div>
      }
    >
      <RedirectInner params={params} />
    </Suspense>
  );
}
