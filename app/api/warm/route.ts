import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import { warmStoreCache } from "@/lib/store";

/** 台帳キャッシュを事前に温める */
export async function POST() {
  try {
    const counts = await warmStoreCache();
    return NextResponse.json({
      ok: true,
      dataBackend: APP_CONFIG.dataBackend,
      cached: counts,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "warm failed";
    console.error("[api/warm]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
