"use client";

import { Fragment, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Phone,
  Route,
  Sparkles,
  User,
  X,
} from "lucide-react";

type Step = 1 | 2 | 3;

type Parking = "onsite" | "coin" | "front" | "none";

type FormValues = {
  address: string;
  parking: Parking | "";
  phone: string;
  name: string;
};

type Slot = {
  date: Date;
  start: string;
  end: string;
};

type Recommended = Slot & {
  badge?: string;
};

const PARKING_OPTIONS: { value: Parking; label: string; note: string }[] = [
  { value: "onsite", label: "敷地内あり", note: "お庭・カーポートなどに1台" },
  { value: "coin", label: "近隣コインパーキングあり", note: "徒歩5分以内が目安です" },
  { value: "front", label: "家の前・私道に駐車可", note: "短時間の路上・私道駐車" },
  { value: "none", label: "なし", note: "こちらで駐車場所を探します" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// デモ用：2026年10月の日付
const day = (d: number) => new Date(2026, 9, d);

const RECOMMENDED: Recommended[] = [
  { date: day(15), start: "10:00", end: "11:00", badge: "🌟 最短対応可能日" },
  { date: day(15), start: "14:00", end: "15:00" },
  { date: day(16), start: "11:00", end: "12:00" },
];

const HOURS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

function endOf(start: string) {
  const h = Number(start.slice(0, 2)) + 1;
  return `${String(h).padStart(2, "0")}:00`;
}

function formatDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})`;
}

function formatSlot(slot: Slot) {
  return `${formatDate(slot.date)} ${slot.start}〜${slot.end}`;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

type CalendarDay = { date: Date; slots: Slot[] };

// デモ用の空き枠（日曜休み・日付と時刻から決まった枠を埋まりにする）
function buildCalendar() {
  const days: CalendarDay[] = [];
  for (let d = 13; d <= 24; d++) {
    const date = day(d);
    if (date.getDay() === 0) continue;
    const slots = HOURS.filter((h, i) => {
      if (date.getDay() === 6 && i >= 4) return false;
      return (d * 7 + i * 3) % 5 !== 0;
    }).map((start) => ({ date, start, end: endOf(start) }));
    days.push({ date, slots });
  }
  return days;
}

const DAYS = buildCalendar();

const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// スマホは3日分、PCは6日分ずつ表示する
function useDaysPerPage() {
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  return wide ? 6 : 3;
}

function parkingLabel(value: FormValues["parking"]) {
  return PARKING_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

/* ---------- 共通の部品 ---------- */

function StepIndicator({ step }: { step: Step }) {
  const labels = ["情報入力", "日程選択", "予約完了"];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="手続きの進み具合">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                active
                  ? "bg-orange-500 text-white"
                  : done
                    ? "bg-white text-blue-900"
                    : "bg-blue-800 text-blue-200"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "font-bold text-white" : "text-blue-200"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function FieldLabel({ icon: Icon, children, htmlFor }: { icon: typeof MapPin; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
      <Icon className="h-5 w-5 text-blue-900" aria-hidden />
      {children}
      <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">必須</span>
    </label>
  );
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm font-bold text-red-600" role="alert">
      {message}
    </p>
  );
}

/* ---------- Step 1 ---------- */

function InputStep({
  values,
  onChange,
  onSubmit,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  onSubmit: () => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    onChange({ ...values, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!values.address.trim()) next.address = "ご住所を入力してください";
    if (!values.parking) next.parking = "駐車場のご案内を1つお選びください";
    const digits = values.phone.replace(/[^0-9０-９]/g, "");
    if (!values.phone.trim()) next.phone = "お電話番号を入力してください";
    else if (digits.length < 10 || digits.length > 11) next.phone = "お電話番号は10〜11桁の数字でご入力ください";
    if (!values.name.trim()) next.name = "お名前を入力してください";
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit();
  };

  const inputClass = (invalid?: string) =>
    `w-full rounded-xl border-2 bg-white px-4 py-4 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-200 ${
      invalid ? "border-red-500" : "border-slate-300 focus:border-blue-900"
    }`;

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <p className="text-base leading-relaxed text-slate-700">
        ご住所を入力いただくと、当日の訪問ルートを考慮して
        <strong className="text-blue-900">いちばん早くお伺いできる日程</strong>
        をご案内します。
      </p>

      <div>
        <FieldLabel icon={MapPin} htmlFor="address">
          ご住所
        </FieldLabel>
        <input
          id="address"
          type="text"
          autoComplete="street-address"
          placeholder="例：東京都杉並区阿佐谷北３丁目４３−１１"
          value={values.address}
          onChange={(e) => set("address", e.target.value)}
          className={inputClass(errors.address)}
          aria-invalid={!!errors.address}
        />
        <ErrorText message={errors.address} />
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-base font-bold text-slate-800">
          <Car className="h-5 w-5 text-blue-900" aria-hidden />
          駐車場のご案内
          <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">必須</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PARKING_OPTIONS.map((option) => {
            const checked = values.parking === option.value;
            return (
              <label
                key={option.value}
                className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition ${
                  checked ? "border-blue-900 bg-blue-50 ring-2 ring-blue-900" : "border-slate-300 bg-white hover:border-blue-400"
                }`}
              >
                <input
                  type="radio"
                  name="parking"
                  value={option.value}
                  checked={checked}
                  onChange={() => set("parking", option.value)}
                  className="h-6 w-6 shrink-0 accent-blue-900"
                />
                <span>
                  <span className="block text-base font-bold text-slate-900">{option.label}</span>
                  <span className="block text-sm text-slate-500">{option.note}</span>
                </span>
              </label>
            );
          })}
        </div>
        <ErrorText message={errors.parking} />
      </fieldset>

      <div>
        <FieldLabel icon={Phone} htmlFor="phone">
          当日ご連絡のつく電話番号
        </FieldLabel>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="例：090-1234-5678"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          className={inputClass(errors.phone)}
          aria-invalid={!!errors.phone}
        />
        <ErrorText message={errors.phone} />
      </div>

      <div>
        <FieldLabel icon={User} htmlFor="name">
          お名前
        </FieldLabel>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="例：荒井 太郎"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          className={inputClass(errors.name)}
          aria-invalid={!!errors.name}
        />
        <ErrorText message={errors.name} />
      </div>

      <button
        type="submit"
        className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 text-xl font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-300 active:scale-[0.99]"
      >
        <Sparkles className="h-6 w-6" aria-hidden />
        最適な空き日程を探す
      </button>
    </form>
  );
}

/* ---------- Step 2 ---------- */

function ScheduleStep({
  address,
  onSelect,
  onBack,
}: {
  address: string;
  onSelect: (slot: Slot) => void;
  onBack: () => void;
}) {
  const [searching, setSearching] = useState(true);
  const [open, setOpen] = useState(false);
  const [firstDay, setFirstDay] = useState(0);
  const perPage = useDaysPerPage();

  useEffect(() => {
    const t = setTimeout(() => setSearching(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (searching) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
        <Loader2 className="h-12 w-12 animate-spin text-blue-900" aria-hidden />
        <p className="text-lg font-bold text-slate-800">最適な空き日程を探しています…</p>
        <p className="text-sm text-slate-500">前後の訪問先からの移動時間を計算しています</p>
      </div>
    );
  }

  const pageStart = Math.floor(firstDay / perPage) * perPage;
  const days = DAYS.slice(pageStart, pageStart + perPage);
  const hasPrev = pageStart > 0;
  const hasNext = pageStart + perPage < DAYS.length;

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-base font-bold text-blue-900 underline-offset-4 hover:underline">
        <ArrowLeft className="h-5 w-5" aria-hidden />
        入力内容を修正する
      </button>

      <div className="flex gap-3 rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
        <Route className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>
          <span className="font-bold">{address}</span> 周辺の訪問予定と移動時間（間検索）をもとに、
          無理なくお伺いできる日程だけを表示しています。
        </p>
      </div>

      <section aria-labelledby="recommend-title">
        <h2 id="recommend-title" className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 sm:text-xl">
          <span aria-hidden>🌟</span>最短でお伺いできるおすすめの3候補
        </h2>
        <ul className="space-y-4">
          {RECOMMENDED.map((slot, i) => (
            <li key={formatSlot(slot)}>
              <button
                type="button"
                onClick={() => onSelect(slot)}
                className={`w-full rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-200 ${
                  i === 0 ? "border-orange-500" : "border-blue-200 hover:border-blue-900"
                }`}
              >
                {slot.badge && (
                  <span className="mb-3 inline-flex items-center rounded-full bg-orange-500 px-3 py-1 text-sm font-bold text-white">
                    {slot.badge}
                  </span>
                )}
                <span className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                  <Calendar className="h-6 w-6 text-blue-900" aria-hidden />
                  {formatDate(slot.date)}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xl font-bold text-blue-900">
                  <Clock className="h-5 w-5" aria-hidden />
                  {slot.start}〜{slot.end}
                </span>
                <span className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-orange-500 text-lg font-bold text-white">
                  この日時を選ぶ
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border-2 border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="calendar-panel"
          className="flex min-h-16 w-full items-center justify-between gap-3 px-5 text-left text-base font-bold text-slate-800"
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-900" aria-hidden />
            その他の空き日程から選ぶ（カレンダー表示）
          </span>
          <ChevronDown className={`h-6 w-6 shrink-0 text-blue-900 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {open && (
          <div id="calendar-panel" className="border-t-2 border-slate-100 p-4">
            <p className="mb-3 text-sm text-slate-600">ご都合のよい時間をタップしてください。色のついた枠が空いている時間です。</p>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setFirstDay(pageStart - perPage)}
                disabled={!hasPrev}
                className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-blue-900 hover:bg-blue-50 disabled:invisible"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
                前へ
              </button>
              <span className="text-sm font-bold text-slate-700">
                {formatShortDate(days[0].date)}〜{formatShortDate(days[days.length - 1].date)}
              </span>
              <button
                type="button"
                onClick={() => setFirstDay(pageStart + perPage)}
                disabled={!hasNext}
                className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-blue-900 hover:bg-blue-50 disabled:invisible"
              >
                次へ
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `2.75rem repeat(${perPage}, minmax(0, 1fr))` }}
            >
              <div />
              {days.map((d) => (
                <div
                  key={d.date.toISOString()}
                  className="flex flex-col items-center rounded-lg bg-slate-100 py-2"
                >
                  <span className={`text-sm font-bold sm:text-base ${d.date.getDay() === 6 ? "text-blue-600" : "text-slate-800"}`}>
                    {formatShortDate(d.date)}
                  </span>
                  <span className="text-xs font-bold text-orange-600">空き{d.slots.length}</span>
                </div>
              ))}
              {perPage > days.length && <div style={{ gridColumn: `span ${perPage - days.length}` }} />}

              {HOURS.map((hour) => (
                <Fragment key={hour}>
                  <div className="pt-1 text-right text-xs font-bold text-slate-500">{hour}</div>
                  {days.map((d) => {
                    const slot = d.slots.find((s) => s.start === hour);
                    return slot ? (
                      <button
                        key={d.date.toISOString()}
                        type="button"
                        onClick={() => onSelect(slot)}
                        aria-label={`${formatSlot(slot)} を選ぶ`}
                        className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-blue-900 leading-tight text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
                      >
                        <span className="text-base font-bold">{slot.start}</span>
                        <span className="text-xs">〜{slot.end}</span>
                      </button>
                    ) : (
                      <div key={d.date.toISOString()} className="min-h-14 rounded-lg border border-dashed border-slate-200" />
                    );
                  })}
                  {perPage > days.length && <div style={{ gridColumn: `span ${perPage - days.length}` }} />}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfirmDialog({
  slot,
  values,
  onConfirm,
  onCancel,
}: {
  slot: Slot;
  values: FormValues;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="confirm-title" className="text-xl font-bold text-slate-900">
            この日時で予約しますか？
          </h2>
          <button type="button" onClick={onCancel} aria-label="閉じる" className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-blue-900 p-5 text-white">
          <p className="flex items-center gap-2 text-2xl font-bold">
            <Calendar className="h-6 w-6" aria-hidden />
            {formatDate(slot.date)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xl font-bold text-orange-300">
            <Clock className="h-5 w-5" aria-hidden />
            {slot.start}〜{slot.end}
          </p>
        </div>

        <dl className="mb-6 space-y-2 text-base text-slate-700">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-500">訪問先</dt>
            <dd className="font-bold">{values.address}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-500">お名前</dt>
            <dd className="font-bold">{values.name} 様</dd>
          </div>
        </dl>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-orange-500 text-xl font-bold text-white hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-300"
          >
            この内容で確定する
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-slate-300 text-lg font-bold text-slate-700 hover:bg-slate-50"
          >
            ほかの日時を選ぶ
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 3 ---------- */

function DoneStep({ slot, values }: { slot: Slot; values: FormValues }) {
  const [photos, setPhotos] = useState(0);

  const rows = [
    { icon: Calendar, label: "訪問日時", value: formatSlot(slot) },
    { icon: MapPin, label: "訪問先ご住所", value: values.address },
    { icon: Car, label: "駐車場", value: parkingLabel(values.parking) },
    { icon: Phone, label: "お電話番号", value: values.phone },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <CheckCircle className="h-20 w-20 text-green-600" aria-hidden />
        <h2 className="text-2xl font-bold text-slate-900">訪問調査のご予約が完了しました</h2>
        <p className="text-base text-slate-600">
          {values.name} 様、ありがとうございます。
          <br />
          前日に確認のご連絡（SMS）をお送りします。
        </p>
      </div>

      <section className="rounded-2xl border-2 border-blue-900 bg-white" aria-label="ご予約内容">
        <h3 className="rounded-t-xl bg-blue-900 px-5 py-3 text-base font-bold text-white">ご予約内容</h3>
        <dl className="divide-y divide-slate-100">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3 px-5 py-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-900" aria-hidden />
              <div>
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-lg font-bold text-slate-900">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-5">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-orange-700">
          <Sparkles className="h-5 w-5" aria-hidden />
          お急ぎの方・訪問前に概算金額を知りたい方へ
        </h3>
        <p className="mb-4 text-base leading-relaxed text-slate-700">
          事前に窓の寸法やお写真をお送りいただければ、訪問日前に概算見積もりをお出しできます。
        </p>
        <label className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 text-lg font-bold text-white hover:bg-orange-600 focus-within:ring-4 focus-within:ring-orange-300">
          <Camera className="h-6 w-6" aria-hidden />
          窓の写真を添付する
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => setPhotos(e.target.files?.length ?? 0)}
          />
        </label>
        {photos > 0 && (
          <p className="mt-3 text-center text-sm font-bold text-orange-700" role="status">
            {photos}枚の写真を選択しました（デモのため送信はされません）
          </p>
        )}
      </section>

      <p className="text-center text-sm text-slate-500">
        日程の変更・キャンセルは、お電話またはSMSでご連絡ください。
      </p>
    </div>
  );
}

/* ---------- ページ ---------- */

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<FormValues>({ address: "", parking: "", phone: "", name: "" });
  const [pending, setPending] = useState<Slot | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-blue-900 text-white">
        <div className="mx-auto max-w-xl px-4 pb-5 pt-6">
          <p className="text-sm font-bold tracking-widest text-orange-300">荒井硝子</p>
          <h1 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">お問合せ・訪問調査 日程調整</h1>
          <div className="mt-5">
            <StepIndicator step={step} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8">
        {step === 1 && <InputStep values={values} onChange={setValues} onSubmit={() => go(2)} />}

        {step === 2 && <ScheduleStep address={values.address} onSelect={setPending} onBack={() => go(1)} />}

        {step === 3 && booked && <DoneStep slot={booked} values={values} />}
      </main>

      <footer className="pb-10 text-center text-xs text-slate-400">日程調整ツール「調整君」</footer>

      {pending && (
        <ConfirmDialog
          slot={pending}
          values={values}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setBooked(pending);
            setPending(null);
            go(3);
          }}
        />
      )}
    </div>
  );
}
