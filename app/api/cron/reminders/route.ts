import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders/run";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

/**
 * Render Cron などから定期呼び出し。
 * 例: 毎時 0 分に GET/POST → 設定の reminderHour（既定18時 JST）のときだけ送信。
 */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const result = await runReminders({ force });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reminder failed" },
      { status: 500 },
    );
  }
}
