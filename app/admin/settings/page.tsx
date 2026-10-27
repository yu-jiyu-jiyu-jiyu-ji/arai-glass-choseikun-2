"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { AppSettings, WorkdayKey } from "@/lib/settings-shared";
import { WORKDAY_LABELS } from "@/lib/settings-shared";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setError("設定の読み込みに失敗しました"));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存に失敗しました");
      setSettings(data);
      setMessage("保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        読み込み中…
      </div>
    );
  }

  const setNum = (key: keyof AppSettings, value: string) => {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setSettings({ ...settings, [key]: n });
  };

  const toggleDay = (key: WorkdayKey) => {
    setSettings({
      ...settings,
      workdays: { ...settings.workdays, [key]: !settings.workdays[key] },
    });
  };

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">共通設定</h1>
        <p className="mt-1 text-sm text-slate-600">事務所・稼働時間・バッファなど間検索の前提値です。</p>
      </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold">事務所（出勤起点）</h2>
          <p className="mb-4 text-sm text-slate-600">
            一日の最初の予定の前に、ここから顧客へ向かう前提で間検索します。
          </p>
          <label className="mb-3 block text-sm font-bold">
            郵便番号
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
              value={settings.officePostalCode}
              onChange={(e) => setSettings({ ...settings, officePostalCode: e.target.value })}
            />
          </label>
          <label className="mb-3 block text-sm font-bold">
            住所
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
              value={settings.officeAddress}
              onChange={(e) => setSettings({ ...settings, officeAddress: e.target.value })}
            />
          </label>
          <label className="block text-sm font-bold">
            建物名など
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
              value={settings.officeBuilding}
              onChange={(e) => setSettings({ ...settings, officeBuilding: e.target.value })}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-bold">就業時間（候補検索）</h2>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            この時間帯に収まる枠だけを候補として表示します。枠の終了時刻が終了時を超える開始時刻は出しません。
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="w-full text-sm font-bold text-slate-700">稼働曜日（定休はオフ）</span>
            {WORKDAY_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`min-h-11 min-w-11 rounded-full text-sm font-bold ${
                  settings.workdays[key]
                    ? "bg-blue-900 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
              開始（時）
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.workdayStartHour}
                onChange={(e) => setNum("workdayStartHour", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              終了（時）
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.workdayEndHour}
                onChange={(e) => setNum("workdayEndHour", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              昼休み開始
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.lunchStartHour}
                onChange={(e) => setNum("lunchStartHour", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              昼休み終了
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.lunchEndHour}
                onChange={(e) => setNum("lunchEndHour", e.target.value)}
              />
            </label>
          </div>
          <p className="mt-3 text-sm font-bold text-blue-900">
            現在の就業帯: {String(settings.workdayStartHour).padStart(2, "0")}:00 〜{" "}
            {String(settings.workdayEndHour).padStart(2, "0")}:00
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-bold">休日設定（候補検索の除外日）</h2>
          <p className="mb-4 text-sm text-slate-600">
            定休曜日に加え、祝日・個別休日は候補日から自動で外します。
          </p>
          <label className="mb-4 flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-900"
              checked={settings.excludeNationalHolidays}
              onChange={(e) =>
                setSettings({ ...settings, excludeNationalHolidays: e.target.checked })
              }
            />
            国民の祝日を自動除外
          </label>
          <label className="block text-sm font-bold">
            個別休日（YYYY-MM-DD を1行に1つ）
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border-2 border-slate-300 px-3 py-3 font-mono text-sm"
              value={(settings.individualHolidays ?? []).join("\n")}
              onChange={(e) => {
                const lines = e.target.value
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                setSettings({ ...settings, individualHolidays: lines });
              }}
              placeholder={"2026-01-02\n2026-12-30"}
            />
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-bold">職人ランク候補</h2>
          <p className="mb-3 text-sm text-slate-600">
            職人マスタのランク選択肢です。カンマ区切り（例: A, B, C, 1）
          </p>
          <input
            className="w-full rounded-xl border-2 border-slate-300 px-3 py-3"
            value={(settings.workerRankOptions ?? []).join(", ")}
            onChange={(e) => {
              const opts = e.target.value
                .split(/[,、]/)
                .map((s) => s.trim())
                .filter(Boolean);
              setSettings({ ...settings, workerRankOptions: opts });
            }}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-bold">間検索パラメータ</h2>
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">
            <p className="font-bold">ΔT（デルタティー）＝遠回りの余分な移動時間</p>
            <p className="mt-1">
              「前の現場→次の現場」に直行する場合と比べて、顧客経由で何分余分にかかるか。
              例: 世田谷→練馬が40分なのに、客（八王子）経由だと90分なら ΔT=50分。
              閾値以上なら候補から外します。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
              調査時間（分）
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.surveyMinutes}
                onChange={(e) => setNum("surveyMinutes", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              安全バッファ（分）
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.bufferMinutes}
                onChange={(e) => setNum("bufferMinutes", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              スロット刻み（分）
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.slotIntervalMinutes}
                onChange={(e) => setNum("slotIntervalMinutes", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              ΔT閾値（分）
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.detourThresholdMinutes}
                onChange={(e) => setNum("detourThresholdMinutes", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              初期探索日数
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.initialSearchDays}
                onChange={(e) => setNum("initialSearchDays", e.target.value)}
              />
            </label>
            <label className="text-sm font-bold">
              最大探索日数
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings.maxSearchDays}
                onChange={(e) => setNum("maxSearchDays", e.target.value)}
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-900"
              checked={settings.requireTwoWorkers}
              onChange={(e) => setSettings({ ...settings, requireTwoWorkers: e.target.checked })}
            />
            同時刻に2人空いている枠のみ出す
          </label>
        </section>

        {message && <p className="text-sm font-bold text-green-700">{message}</p>}
        {error && (
          <p className="text-sm font-bold text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-lg font-bold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          設定を保存
        </button>
    </main>
  );
}
