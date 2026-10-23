"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import type { BookingLink, Worker } from "@/lib/types";

export default function LinksPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const [wRes, lRes] = await Promise.all([fetch("/api/workers"), fetch("/api/booking-links")]);
        const wData = await wRes.json();
        const lData = await lRes.json();
        if (!wRes.ok) throw new Error(wData.error || "職人の読込失敗");
        if (!lRes.ok) throw new Error(lData.error || "URL一覧の読込失敗");
        setWorkers((wData.workers as Worker[]).filter((w) => w.active));
        setLinks(lData.links);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込み失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelected(workers.map((w) => w.id));
  const clearAll = () => setSelected([]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/booking-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerIds: selected.length > 0 ? selected : workers.map((w) => w.id),
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "発行に失敗しました");
      setLinks((prev) => [data.link, ...prev]);
      setNote("");
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const copyUrl = async (token: string) => {
    const url = `${origin}/r/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? id;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">顧客用URL発行</h1>
        <p className="mt-1 text-sm text-slate-600">
          お客様ごとに新しいURLを発行します。候補職人を複数（または全員）選べます。未選択時は有効な全員が候補になります。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold">新規発行</h2>
        <div className="mb-3 flex gap-2">
          <button type="button" onClick={selectAll} className="text-sm font-bold text-blue-900 underline">
            全員選択
          </button>
          <button type="button" onClick={clearAll} className="text-sm font-bold text-slate-600 underline">
            クリア
          </button>
        </div>
        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          {workers.map((w) => (
            <li key={w.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} />
                {w.name}
                {w.surveyMain && <span className="text-xs text-orange-600">調査メイン</span>}
              </label>
            </li>
          ))}
        </ul>
        <label className="mb-4 block text-sm font-bold">
          メモ（社内用）
          <input
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 山田様・電話問い合わせ"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating || workers.length === 0}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {creating ? "発行中…" : "URLを発行する"}
        </button>
        {error && (
          <p className="mt-3 text-sm font-bold text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">発行済み</h2>
        {links.length === 0 ? (
          <p className="rounded-xl bg-slate-100 p-6 text-center text-slate-600">まだありません。</p>
        ) : (
          links.map((link) => {
            const url = `${origin}/r/${link.token}`;
            return (
              <article key={link.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="break-all font-mono text-sm text-blue-900">{url}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {new Date(link.createdAt).toLocaleString("ja-JP")}
                  {link.note ? ` / ${link.note}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  候補: {link.workerIds.map(nameOf).join("・")}
                </p>
                <button
                  type="button"
                  onClick={() => void copyUrl(link.token)}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  {copied === link.token ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" /> コピーしました
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> URLをコピー
                    </>
                  )}
                </button>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
