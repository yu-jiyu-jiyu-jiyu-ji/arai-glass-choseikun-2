"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Booking, Worker } from "@/lib/types";

function formatDt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [date, setDate] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const workerName = (id: string) => workers.find((w) => w.id === id)?.name ?? id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (workerId) params.set("workerId", workerId);
      if (date) params.set("date", date);
      const [bRes, wRes] = await Promise.all([
        fetch(`/api/bookings?${params}`),
        fetch("/api/workers"),
      ]);
      const bData = await bRes.json();
      const wData = await wRes.json();
      if (!bRes.ok) throw new Error(bData.error || "読み込み失敗");
      setBookings(bData.bookings);
      setWorkers(wData.workers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [status, q, workerId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    if (!confirm("この予約をキャンセルしますか？同じ発行URLから再調整できるようになります。")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "キャンセル失敗");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "キャンセル失敗");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">予約一覧</h1>
        <p className="mt-1 text-sm text-slate-600">キャンセルはオペレーター操作のみ（顧客画面からは不可）。</p>
      </div>

      <section className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-bold">
          状態
          <select
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">すべて</option>
            <option value="confirmed">確定</option>
            <option value="cancelled">キャンセル</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          担当
          <select
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
          >
            <option value="">すべて</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          日付
          <input
            type="date"
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm font-bold">
          検索
          <input
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"
            placeholder="氏名・電話・メール"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-blue-900 px-4 py-1.5 text-sm font-bold text-white"
        >
          再読み込み
        </button>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-600">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          読み込み中…
        </div>
      ) : error ? (
        <p className="font-bold text-red-600" role="alert">
          {error}
        </p>
      ) : bookings.length === 0 ? (
        <p className="rounded-xl bg-slate-100 p-6 text-center text-slate-600">予約はまだありません。</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {b.name} 様
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-xs font-bold ${
                        b.status === "confirmed"
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {b.status === "confirmed" ? "確定" : "キャンセル"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-bold text-blue-900">
                    {formatDt(b.start)}〜{formatDt(b.end).split(" ")[1]}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{b.address}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {b.phone} / {b.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    担当: {b.workerIds.map(workerName).join("・") || "未割当"}
                    {b.linkToken ? ` / URL: …${b.linkToken.slice(-6)}` : " / 直予約"}
                  </p>
                </div>
                {b.status === "confirmed" && (
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => void cancel(b.id)}
                    className="rounded-xl border-2 border-red-300 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyId === b.id ? "処理中…" : "キャンセル"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
