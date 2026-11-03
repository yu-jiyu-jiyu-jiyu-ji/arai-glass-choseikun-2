"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { BookingFlow } from "@/components/booking-flow";
import type { Worker } from "@/lib/types";

/** 社内電話受付: 住所→枠→顧客情報（メール任意） */
export default function InternalBookingPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<"single" | "pair">("pair");

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
      <BookingFlow
        mode="staff"
        emailOptional
        addressFirst
        requireTwoWorkers={assignmentMode === "pair"}
        workerIds={selected}
        onRestart={() => setStarted(false)}
      />
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">電話受付・社内予約</h1>
        <p className="mt-1 text-sm text-slate-600">
          住所を先に入力し、空き枠を選んでからお客様情報を入れます。メールは任意です。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold">必要人数</h2>
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
                name="assignmentMode"
                checked={assignmentMode === opt.value}
                onChange={() => setAssignmentMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">候補職人（{poolLabel}）</h2>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className="font-bold text-blue-900 underline"
              onClick={() => setSelected(workers.map((w) => w.id))}
            >
              全員
            </button>
            <button
              type="button"
              className="font-bold text-slate-600 underline"
              onClick={() => setSelected([])}
            >
              クリア
            </button>
          </div>
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
      </section>

      <button
        type="button"
        disabled={selected.length === 0 || (assignmentMode === "pair" && selected.length < 2)}
        onClick={() => setStarted(true)}
        className="w-full rounded-2xl bg-orange-500 py-4 text-lg font-bold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        住所入力・枠検索へ進む
      </button>
    </main>
  );
}
