import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import { getDb } from "@/lib/firebase";
import { oauthConfigured } from "@/lib/google/oauth";
import { mapsConfigured } from "@/lib/google/maps";
import { mailConfigured, resendConfigured, smtpConfigured } from "@/lib/mail/smtp";
import { loadWorkers } from "@/lib/store";

export async function GET() {
  const backend = APP_CONFIG.dataBackend;
  const result: Record<string, unknown> = {
    ok: true,
    dataBackend: backend,
    calendarTravelMode: APP_CONFIG.useMockProviders ? "mock" : "live",
    oauthConfigured: oauthConfigured(),
    mapsConfigured: mapsConfigured(),
    smtpConfigured: smtpConfigured(),
    resendConfigured: resendConfigured(),
    mailConfigured: mailConfigured(),
    /** デプロイ確認用 */
    buildTag: "mail-resend-v1",
  };

  try {
    if (backend === "firestore") {
      const db = getDb();
      result.firestore = db ? "connected" : "unavailable";
      if (!db) {
        return NextResponse.json({ ...result, ok: false, error: "Firestore 未接続" }, { status: 503 });
      }
    }
    const workers = await loadWorkers();
    result.workerCount = workers.length;
    result.workersSample = workers.slice(0, 5).map((w) => ({
      id: w.id,
      name: w.name,
      active: w.active,
      oauthLinked: w.oauthLinked,
      surveyMain: w.surveyMain,
    }));
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "health check failed";
    console.error("[api/health]", e);
    return NextResponse.json({ ...result, ok: false, error: message }, { status: 500 });
  }
}
