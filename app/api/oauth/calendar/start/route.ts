import { NextResponse } from "next/server";
import { buildCalendarAuthUrl, oauthConfigured } from "@/lib/google/oauth";
import { loadWorkers } from "@/lib/store";

export async function GET(req: Request) {
  if (!oauthConfigured()) {
    return NextResponse.json(
      { error: "OAuth が未設定です（CLIENT_ID / SECRET / REDIRECT_URI）" },
      { status: 503 },
    );
  }

  const workerId = new URL(req.url).searchParams.get("workerId")?.trim();
  if (!workerId) {
    return NextResponse.json({ error: "workerId が必要です" }, { status: 400 });
  }

  const workers = await loadWorkers();
  const worker = workers.find((w) => w.id === workerId);
  if (!worker) {
    return NextResponse.json({ error: "職人が見つかりません" }, { status: 404 });
  }

  const url = buildCalendarAuthUrl(workerId);
  if (!url) {
    return NextResponse.json({ error: "認証URLの生成に失敗しました" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
