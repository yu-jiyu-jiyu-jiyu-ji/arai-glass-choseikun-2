"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Worker } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/settings-shared";

const emptyForm = {
  name: "",
  googleEmail: "",
  rank: "",
  surveyMain: false,
  oauthLinked: false,
  active: true,
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rankOptions, setRankOptions] = useState<string[]>(DEFAULT_SETTINGS.workerRankOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [wRes, sRes] = await Promise.all([fetch("/api/workers"), fetch("/api/settings")]);
      const wData = await wRes.json();
      const sData = await sRes.json();
      if (!wRes.ok) throw new Error(wData.error || "読み込み失敗");
      setWorkers(wData.workers);
      if (Array.isArray(sData.workerRankOptions) && sData.workerRankOptions.length > 0) {
        setRankOptions(sData.workerRankOptions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (w: Worker) => {
    setEditId(w.id);
    setForm({
      name: w.name,
      googleEmail: w.googleEmail,
      rank: w.rank ?? "",
      surveyMain: w.surveyMain,
      oauthLinked: w.oauthLinked,
      active: w.active,
    });
    setMessage(null);
    setError(null);
  };

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/workers", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setMessage(editId ? "更新しました" : "登録しました");
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

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
        <h1 className="text-2xl font-bold">職人マスタ</h1>
        <p className="mt-1 text-sm text-slate-600">
          Googleメール・ランク・OAuth 連携状態を管理します。ランク候補は共通設定で変更できます。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">{editId ? "職人を編集" : "職人を追加"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">
            氏名
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-sm font-bold">
            Googleメール
            <input
              type="email"
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              value={form.googleEmail}
              onChange={(e) => setForm({ ...form, googleEmail: e.target.value })}
            />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            職人ランク
            <select
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-2"
              value={form.rank}
              onChange={(e) => setForm({ ...form, rank: e.target.value })}
            >
              <option value="">（未設定）</option>
              {rankOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.surveyMain}
              onChange={(e) => setForm({ ...form, surveyMain: e.target.checked })}
            />
            調査メイン
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.oauthLinked}
              onChange={(e) => setForm({ ...form, oauthLinked: e.target.checked })}
            />
            OAuth連携済み
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            有効
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : editId ? "更新する" : "登録する"}
          </button>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border-2 border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700"
            >
              キャンセル
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-sm font-bold text-green-700">{message}</p>}
        {error && (
          <p className="mt-3 text-sm font-bold text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-bold">氏名</th>
              <th className="px-4 py-3 font-bold">ランク</th>
              <th className="px-4 py-3 font-bold">Google</th>
              <th className="px-4 py-3 font-bold">属性</th>
              <th className="px-4 py-3 font-bold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3 font-bold text-slate-900">{w.name}</td>
                <td className="px-4 py-3 font-bold text-slate-800">{w.rank || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{w.googleEmail}</td>
                <td className="px-4 py-3">
                  <span className="mr-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-bold">
                    {w.active ? "有効" : "無効"}
                  </span>
                  {w.surveyMain && (
                    <span className="mr-2 inline-block rounded bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                      調査メイン
                    </span>
                  )}
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      w.oauthLinked ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {w.oauthLinked ? "OAuth済" : "未連携"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => startEdit(w)}
                    className="font-bold text-blue-900 underline-offset-2 hover:underline"
                  >
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
