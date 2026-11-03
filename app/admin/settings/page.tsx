"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Save } from "lucide-react";
import type { AppSettings, InviteFreeStatus, WorkdayKey } from "@/lib/settings-shared";
import { INVITE_STATUS_OPTIONS, WORKDAY_LABELS } from "@/lib/settings-shared";

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-4 border-t border-slate-100 px-5 py-5">{children}</div>}
    </section>
  );
}

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
      setMessage("保存しました（Firestore）");
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

  const toggleInvite = (value: InviteFreeStatus) => {
    const cur = new Set(settings.inviteStatusesAsFree ?? ["declined"]);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    if (cur.size === 0) cur.add("declined");
    setSettings({ ...settings, inviteStatusesAsFree: [...cur] });
  };

  const onImage = (file: File | null) => {
    if (!file) {
      setSettings({ ...settings, guideImageDataUrl: "", guideImageFileName: "" });
      return;
    }
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      setError("PNG または JPG を選んでください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSettings({
        ...settings,
        guideImageDataUrl: String(reader.result || ""),
        guideImageFileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">共通設定</h1>
        <p className="mt-1 text-sm text-slate-600">Firestore に保存されます。項目は折りたたみで整理しています。</p>
      </div>

      <Accordion title="職人・稼働設定" defaultOpen>
        <div>
          <p className="mb-2 text-sm font-bold text-slate-700">稼働曜日</p>
          <div className="flex flex-wrap gap-2">
            {WORKDAY_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`min-h-11 min-w-11 rounded-full text-sm font-bold ${
                  settings.workdays[key] ? "bg-blue-900 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["workdayStartHour", "就業開始（時）"],
              ["workdayEndHour", "就業終了（時）"],
              ["lunchStartHour", "昼休み開始"],
              ["lunchEndHour", "昼休み終了"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-bold">
              {label}
              <input
                type="number"
                min={0}
                max={23}
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings[key]}
                onChange={(e) => setNum(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm font-bold">
          職人ランク候補（カンマ区切り）
          <input
            className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
            value={(settings.workerRankOptions ?? []).join(", ")}
            onChange={(e) => {
              const opts = e.target.value
                .split(/[,、]/)
                .map((s) => s.trim())
                .filter(Boolean);
              setSettings({ ...settings, workerRankOptions: opts });
            }}
          />
        </label>
        <label className="flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-900"
            checked={settings.requireTwoWorkers}
            onChange={(e) => setSettings({ ...settings, requireTwoWorkers: e.target.checked })}
          />
          既定でペア(2名)枠のみ出す（URL発行で上書き可）
        </label>
      </Accordion>

      <Accordion title="カレンダー・バッファ設定" defaultOpen>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["surveyMinutes", "現地調査時間（分）"],
              ["bufferMinutes", "調査後バッファ（分）"],
              ["travelBufferMinutes", "移動バッファ（分）"],
              ["detourThresholdMinutes", "ΔT閾値（分）"],
              ["slotIntervalMinutes", "スロット刻み（分）"],
              ["initialSearchDays", "初期探索日数"],
              ["maxSearchDays", "最大探索日数"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-bold">
              {label}
              <input
                type="number"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
                value={settings[key] ?? 0}
                onChange={(e) => setNum(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">空き枠としてカウントする招待ステータス</p>
          <p className="mb-3 text-xs text-slate-600">既定は「辞退」のみ。未回答・仮承諾は重複リスクあり。</p>
          <ul className="space-y-2">
            {INVITE_STATUS_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <label className="flex items-start gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-blue-900"
                    checked={(settings.inviteStatusesAsFree ?? []).includes(opt.value)}
                    onChange={() => toggleInvite(opt.value)}
                  />
                  <span>
                    {opt.label}
                    {opt.warn && (
                      <span className="mt-1 block text-xs font-normal text-amber-700">
                        ※チェックを入れると未確定の予定にも予約が入るため、重複リスクがあります
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <label className="flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-900"
            checked={settings.excludeNationalHolidays}
            onChange={(e) => setSettings({ ...settings, excludeNationalHolidays: e.target.checked })}
          />
          国民の祝日を自動除外
        </label>
        <label className="block text-sm font-bold">
          個別休日（YYYY-MM-DD を1行に1つ）
          <textarea
            className="mt-1 min-h-24 w-full rounded-xl border-2 border-slate-300 px-3 py-3 font-mono text-sm"
            value={(settings.individualHolidays ?? []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
              setSettings({ ...settings, individualHolidays: lines });
            }}
          />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-bold">事務所</p>
          <input
            className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
            value={settings.officePostalCode}
            onChange={(e) => setSettings({ ...settings, officePostalCode: e.target.value })}
            placeholder="郵便番号"
          />
          <input
            className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
            value={settings.officeAddress}
            onChange={(e) => setSettings({ ...settings, officeAddress: e.target.value })}
            placeholder="住所"
          />
          <input
            className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm"
            value={settings.officeBuilding}
            onChange={(e) => setSettings({ ...settings, officeBuilding: e.target.value })}
            placeholder="建物名"
          />
        </div>
      </Accordion>

      <Accordion title="メール・案内設定">
        <label className="flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-900"
            checked={settings.reminderEnabled ?? true}
            onChange={(e) => setSettings({ ...settings, reminderEnabled: e.target.checked })}
          />
          リマインドメールを送る
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">
            送信時刻（時）
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
              value={settings.reminderHour ?? 18}
              onChange={(e) => setNum("reminderHour", e.target.value)}
            />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            何日前（カンマ区切り）
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-300 px-3 py-3"
              value={(settings.reminderDaysBefore ?? [7, 1]).join(", ")}
              onChange={(e) => {
                const days = e.target.value
                  .split(/[,、\s]+/)
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n >= 0);
                setSettings({ ...settings, reminderDaysBefore: days.length ? days : [7, 1] });
              }}
            />
          </label>
        </div>
        <label className="block text-sm font-bold">
          完了メール案内文
          <textarea
            className="mt-1 min-h-36 w-full rounded-xl border-2 border-slate-300 px-3 py-3 text-sm"
            value={settings.customerMailBody ?? ""}
            onChange={(e) => setSettings({ ...settings, customerMailBody: e.target.value })}
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-bold">案内画像（PNG/JPG）</p>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => onImage(e.target.files?.[0] ?? null)}
          />
          {settings.guideImageFileName && (
            <p className="mt-1 text-xs text-slate-600">{settings.guideImageFileName}</p>
          )}
          {settings.guideImageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.guideImageDataUrl} alt="案内" className="mt-2 max-h-40 rounded-lg border" />
          )}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">画像の送信形式</legend>
          <label className="mb-2 flex items-center gap-2 text-sm font-bold">
            <input
              type="radio"
              checked={(settings.guideImageSendMode ?? "inline") === "inline"}
              onChange={() => setSettings({ ...settings, guideImageSendMode: "inline" })}
            />
            本文内に埋め込み表示（推奨）
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="radio"
              checked={settings.guideImageSendMode === "attachment"}
              onChange={() => setSettings({ ...settings, guideImageSendMode: "attachment" })}
            />
            ファイルとして添付
          </label>
        </fieldset>
      </Accordion>

      {message && <p className="text-sm font-bold text-green-700">{message}</p>}
      {error && (
        <p className="text-sm font-bold text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-lg font-bold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        設定を保存
      </button>
    </main>
  );
}
