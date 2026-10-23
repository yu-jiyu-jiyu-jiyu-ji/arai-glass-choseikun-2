"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { BookingFlow } from "@/components/booking-flow";
import type { Worker } from "@/lib/types";

export default function AdminBookPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workers");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "職人の読込に失敗しました");
        const active = (data.workers as Worker[]).filter((w) => w.active);
        setWorkers(active);
        setSelected(active.map((w) => w.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込み失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allSelected = selected.length > 0 && selected.length === workers.length;
  const poolLabel = useMemo(() => {
    if (selected.length === 0) return "候補なし";
    if (allSelected) return `全員（${workers.length}名）`;
    return `${selected.length}名を選択中`;
  }, [selected.length, allSelected, workers.length]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <p className="font-bold text-red-600" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (started) {
    return (
      <div>
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              候補: <span className="font-bold text-slate-900">{poolLabel}</span>
            </p>
            <button
              type="button"
              onClick={() => setStarted(false)}
              className="text-sm font-bold text-blue-900 underline-offset-2 hover:underline"
            >
              候補を変更する
            </button>
          </div>
        </div>
        <BookingFlow
          key={selected.join(",")}
          mode="staff"
          workerIds={allSelected ? undefined : selected}
          onRestart={() => setStarted(false)}
        />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">予約調整（社内）</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          電話口など、その場でお客様情報を入力して日程を確定します。初期状態は有効な全社員が候補です。必要なら検索前に絞り込めます。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">候補社員</h2>
          <div className="flex gap-3 text-sm font-bold">
            <button
              type="button"
              onClick={() => setSelected(workers.map((w) => w.id))}
              className="text-blue-900 underline-offset-2 hover:underline"
            >
              全員
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-slate-600 underline-offset-2 hover:underline"
            >
              クリア
            </button>
          </div>
        </div>
        <p className="mb-3 text-sm text-slate-500">{poolLabel}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {workers.map((w) => (
            <li key={w.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(w.id)}
                  onChange={() => toggle(w.id)}
                />
                {w.name}
                {w.surveyMain && <span className="text-xs font-bold text-orange-600">調査メイン</span>}
              </label>
            </li>
          ))}
        </ul>
        {workers.length === 0 && (
          <p className="mt-3 text-sm text-red-600">有効な職人がいません。先に職人マスタを登録してください。</p>
        )}
      </section>

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => setStarted(true)}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-orange-500 text-lg font-bold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        お客様情報の入力へ進む
      </button>
      <p className="text-center text-xs text-slate-500">
        お客様にURLを渡す場合は「URL発行」を使ってください。
      </p>
    </main>
  );
}
