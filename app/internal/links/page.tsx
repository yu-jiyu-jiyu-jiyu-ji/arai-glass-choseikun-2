"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import type { AssignmentMode, BookingLink, Worker } from "@/lib/types";

/** 2タップURL発行: 担当者選択 + 必要人数 */
export default function InternalLinksPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("pair");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
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

  const issue = async () => {
    if (selected.length === 0) {
      setError("担当者を1名以上選択してください");
      return;
    }
    if (assignmentMode === "pair" && selected.length < 2) {
      setError("ペアモードでは2名以上選択してください");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/booking-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerIds: selected, assignmentMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "発行に失敗しました");
      const link = data.link as BookingLink;
      const url = `${origin}/reserve?token=${link.token}`;
      setLinks((prev) => [link, ...prev]);
      setLastUrl(url);
      await navigator.clipboard.writeText(url);
      setCopied(link.token);
      setTimeout(() => setCopied(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (link: BookingLink) => {
    if (!window.confirm("このURLを削除しますか？")) return;
    setDeletingId(link.id);
    try {
      const res = await fetch(`/api/booking-links/${encodeURIComponent(link.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "削除失敗");
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除失敗");
    } finally {
      setDeletingId(null);
    }
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
        <h1 className="text-2xl font-bold">顧客用URL発行（2タップ）</h1>
        <p className="mt-1 text-sm text-slate-600">担当者を選び、必要人数を選んで発行・コピーします。</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
        <div>
          <h2 className="mb-3 text-lg font-bold">1. 担当者</h2>
          <div className="mb-2 flex gap-2 text-sm">
            <button
              type="button"
              className="font-bold text-blue-900 underline"
              onClick={() => setSelected(workers.map((w) => w.id))}
            >
              全員選択
            </button>
            <button type="button" className="font-bold text-slate-600 underline" onClick={() => setSelected([])}>
              クリア
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {workers.map((w) => (
              <li key={w.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={selected.includes(w.id)}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.includes(w.id) ? prev.filter((x) => x !== w.id) : [...prev, w.id],
                      )
                    }
                  />
                  {w.name}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold">2. 必要人数</h2>
          <div className="flex flex-wrap gap-3">
            {(
              [
                { value: "single" as const, label: "誰か1名" },
                { value: "pair" as const, label: "ペア(2名同時)" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-bold ${
                  assignmentMode === opt.value ? "border-blue-900 bg-blue-50" : "border-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={assignmentMode === opt.value}
                  onChange={() => setAssignmentMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void issue()}
          disabled={creating}
          className="w-full rounded-xl bg-orange-500 py-3 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {creating ? "発行中…" : "URLを発行してコピー"}
        </button>
        {lastUrl && (
          <p className="break-all rounded-xl bg-green-50 p-3 text-sm font-mono text-green-900">
            {copied ? "コピーしました: " : ""}
            {lastUrl}
          </p>
        )}
        {error && (
          <p className="text-sm font-bold text-red-600" role="alert">
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
            const url = `${origin}/reserve?token=${link.token}`;
            return (
              <article key={link.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="break-all font-mono text-sm text-blue-900">{url}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {link.assignmentMode === "single" ? "誰か1名" : "ペア"} / 候補:{" "}
                  {link.workerIds.map(nameOf).join("・")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(url);
                      setCopied(link.token);
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold"
                  >
                    {copied === link.token ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" /> コピー済
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" /> コピー
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(link)}
                    disabled={deletingId === link.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingId === link.id ? "削除中…" : "削除"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
