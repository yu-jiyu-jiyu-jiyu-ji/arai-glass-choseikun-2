/**
 * Google OAuth（Calendar）— fetch ベース（googleapis 依存なし）
 */

const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export function oauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim(),
  );
}

export function getRedirectUri(): string {
  return (process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
}

function clientId() {
  return (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
}
function clientSecret() {
  return (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
}

/** state = workerId を含む短い署名なしペイロード（テスト用） */
export function encodeOAuthState(workerId: string): string {
  const payload = JSON.stringify({ w: workerId, t: Date.now() });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeOAuthState(state: string): { workerId: string } | null {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const data = JSON.parse(raw) as { w?: string };
    if (!data.w) return null;
    return { workerId: data.w };
  } catch {
    return null;
  }
}

export function buildCalendarAuthUrl(workerId: string): string | null {
  if (!oauthConfigured()) return null;
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: encodeOAuthState(workerId),
  });
  return `${AUTH_URI}?${params.toString()}`;
}

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
  scope?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "トークン交換に失敗しました");
  }
  if (!data.refresh_token) {
    throw new Error(
      "refresh_token がありません。Google で連携を解除してから、もう一度「同意」付きで連携してください。",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    scope: data.scope,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number | null;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "アクセストークンの更新に失敗しました");
  }
  return {
    accessToken: data.access_token,
    expiryDate: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  };
}
