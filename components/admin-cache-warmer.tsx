"use client";

import { useEffect } from "react";

/**
 * 社内画面を開いたタイミングで台帳キャッシュを温める。
 * 職人マスタ等への遷移前に裏側で取得しておく。
 */
export function AdminCacheWarmer() {
  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/warm", { method: "POST", signal: ctrl.signal }).catch(() => {
      /* 暖機失敗は画面上は無視（各ページが再取得する） */
    });
    return () => ctrl.abort();
  }, []);

  return null;
}
