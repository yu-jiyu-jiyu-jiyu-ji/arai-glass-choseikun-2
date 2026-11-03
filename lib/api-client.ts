/** fetch 応答を JSON として読む。HTML/空応答のときは日本語エラーにする */
export async function readApiJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }

  if (data && typeof data === "object") {
    if (!res.ok) {
      throw new Error(toJapaneseApiError(data.error, res.status));
    }
    return data;
  }

  throw new Error(toJapaneseApiError(undefined, res.status));
}

function toJapaneseApiError(message: string | undefined, status: number): string {
  const raw = (message || "").trim();
  if (raw && !looksLikeTechnicalEnglish(raw)) return raw;

  if (status === 401) return "認証に失敗しました。再度お試しください。";
  if (status === 404) return "ページまたはAPIが見つかりません。";
  if (status === 408 || status === 504) {
    return "サーバーの応答がタイムアウトしました。しばらくしてから再度お試しください。";
  }
  if (status === 502 || status === 503) {
    return "サーバーが一時的に利用できません（更新中の可能性があります）。しばらくしてから再度お試しください。";
  }
  if (status >= 500) return "サーバーでエラーが発生しました。しばらくしてから再度お試しください。";
  return "サーバーからの応答を読み取れませんでした。ページを再読み込みして再度お試しください。";
}

function looksLikeTechnicalEnglish(s: string): boolean {
  return (
    /Unexpected token/i.test(s) ||
    /is not valid JSON/i.test(s) ||
    /<!DOCTYPE/i.test(s) ||
    /Failed to fetch/i.test(s) ||
    /NetworkError/i.test(s) ||
    /ECONNREFUSED/i.test(s)
  );
}

/** catch した Error.message も英語技術文言なら日本語に置換 */
export function toUserFacingError(e: unknown, fallback: string): string {
  if (!(e instanceof Error) || !e.message) return fallback;
  if (looksLikeTechnicalEnglish(e.message)) {
    return "サーバーからの応答を読み取れませんでした。ページを再読み込みして再度お試しください。";
  }
  return e.message;
}
