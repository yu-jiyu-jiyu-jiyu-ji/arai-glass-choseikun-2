import { NextResponse } from "next/server";
import { decodeOAuthState, exchangeCodeForTokens, oauthConfigured } from "@/lib/google/oauth";
import { saveWorkerRefreshToken } from "@/lib/providers/oauth-tokens";

function htmlPage(title: string, body: string, ok: boolean) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6}
    .ok{color:#166534}.ng{color:#b91c1c}a{color:#1e3a8a}</style></head>
    <body><h1 class="${ok ? "ok" : "ng"}">${title}</h1><p>${body}</p>
    <p><a href="/admin/workers">職人マスタへ戻る</a></p></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  if (!oauthConfigured()) {
    return htmlPage("設定エラー", "OAuth 環境変数が不足しています。", false);
  }

  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return htmlPage("連携キャンセル", `Google 側: ${err}`, false);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return htmlPage("不正なリクエスト", "code / state がありません。", false);
  }

  const decoded = decodeOAuthState(state);
  if (!decoded) {
    return htmlPage("不正な state", "連携をやり直してください。", false);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveWorkerRefreshToken(decoded.workerId, tokens.refreshToken);
    return htmlPage(
      "カレンダー連携完了",
      `職人「${decoded.workerId}」の Google カレンダー連携が完了しました。`,
      true,
    );
  } catch (e) {
    console.error("[oauth/callback]", e);
    return htmlPage(
      "連携失敗",
      e instanceof Error ? e.message : "トークンの保存に失敗しました。",
      false,
    );
  }
}
