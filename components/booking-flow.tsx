"use client";

import { Fragment, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
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
  email: string;
};

type Slot = {
  date: Date;
  start: string;
  end: string;
  workerIds?: string[];
};

type Recommended = Slot & {
  badge?: string;
};

type ApiSlot = { start: string; end: string; workerIds?: string[] };
type ApiDay = { date: string; slots: ApiSlot[] };

export type BookingFlowProps = {
  /** 発行URL経由のとき。間検索プールと予約紐づけに使う */
  linkToken?: string;
  /** 候補職人（未指定・空なら有効な全員）。社内代理入力の絞り込み用 */
  workerIds?: string[];
  /** フッターに社内リンクを出すか（公開URLでは出さない） */
  showAdminLink?: boolean;
  /** staff: 社内代理入力表示 */
  mode?: "customer" | "staff";
  /** 完了後「続けて別件」など（社内用） */
  onRestart?: () => void;
};

const PARKING_OPTIONS: { value: Parking; label: string; note: string }[] = [
  { value: "onsite", label: "敷地内あり", note: "お庭・カーポートなどに1台" },
  { value: "coin", label: "近隣コインパーキングあり", note: "徒歩5分以内が目安です" },
  { value: "front", label: "家の前・私道に駐車可", note: "短時間の路上・私道駐車" },
  { value: "none", label: "なし", note: "こちらで駐車場所を探します" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const HOURS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toSlot(isoStart: string, isoEnd: string, workerIds?: string[]): Slot {
  const startDt = new Date(isoStart);
  const endDt = new Date(isoEnd);
  return {
    date: new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate()),
    start: `${pad2(startDt.getHours())}:${pad2(startDt.getMinutes())}`,
    end: `${pad2(endDt.getHours())}:${pad2(endDt.getMinutes())}`,
    workerIds,
  };
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

function buildCalendarFromApi(days: ApiDay[]): CalendarDay[] {
  return days.map((d) => {
    const [y, m, dayNum] = d.date.split("-").map(Number);
    const date = new Date(y, m - 1, dayNum);
    return {
      date,
      slots: d.slots.map((s) => toSlot(s.start, s.end, s.workerIds)),
    };
  });
}

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
    const address = values.address.replace(/\s/g, "");
    if (!values.address.trim()) next.address = "ご住所を入力してください";
    else if (!/\d|[０-９]/.test(address) || address.length < 8) {
      next.address = "丁目・番地・号までご入力ください（例: 東京都台東区寿3-9-6）";
    }
    if (!values.parking) next.parking = "駐車場のご案内を1つお選びください";
    const digits = values.phone.replace(/[^0-9０-９]/g, "");
    if (!values.phone.trim()) next.phone = "お電話番号を入力してください";
    else if (digits.length < 10 || digits.length > 11) next.phone = "お電話番号は10〜11桁の数字でご入力ください";
    if (!values.name.trim()) next.name = "お名前を入力してください";
    if (!values.email.trim()) next.email = "メールアドレスを入力してください";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = "メールアドレスの形式をご確認ください";
    }
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
          placeholder="例：東京都台東区寿3-9-6"
          value={values.address}
          onChange={(e) => set("address", e.target.value)}
          className={inputClass(errors.address)}
          aria-invalid={!!errors.address}
        />
        <p className="mt-1 text-sm text-slate-500">市区町村だけでなく、丁目・番地・号までご入力ください。</p>
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

      <div>
        <FieldLabel icon={Mail} htmlFor="email">
          メールアドレス
        </FieldLabel>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="例：taro@example.com"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          className={inputClass(errors.email)}
          aria-invalid={!!errors.email}
        />
        <p className="mt-1 text-sm text-slate-500">ご予約確認・リマインド・見積のご連絡に使用します。</p>
        <ErrorText message={errors.email} />
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
  linkToken,
  workerIds,
  onSelect,
  onBack,
}: {
  address: string;
  linkToken?: string;
  workerIds?: string[];
  onSelect: (slot: Slot) => void;
  onBack: () => void;
}) {
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<Recommended[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [open, setOpen] = useState(false);
  const [firstDay, setFirstDay] = useState(0);
  const perPage = useDaysPerPage();
  const workerKey = workerIds?.join(",") ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await fetch("/api/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            linkToken,
            workerIds: workerIds?.length ? workerIds : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "検索に失敗しました");
        if (cancelled) return;
        const rec: Recommended[] = (data.recommended as ApiSlot[]).map((s, i) => ({
          ...toSlot(s.start, s.end, s.workerIds),
          badge: i === 0 ? "🌟 最短対応可能日" : undefined,
        }));
        setRecommended(rec);
        setCalendarDays(buildCalendarFromApi(data.days as ApiDay[]));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "検索に失敗しました");
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, linkToken, workerKey]);

  if (searching) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
        <Loader2 className="h-12 w-12 animate-spin text-blue-900" aria-hidden />
        <p className="text-lg font-bold text-slate-800">最適な空き日程を探しています…</p>
        <p className="text-sm text-slate-500">前後の訪問先からの移動時間を計算しています</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-lg font-bold text-red-600" role="alert">
          {error}
        </p>
        <button type="button" onClick={onBack} className="text-base font-bold text-blue-900 underline">
          入力内容を修正する
        </button>
      </div>
    );
  }

  const pageStart = Math.floor(firstDay / perPage) * perPage;
  const days = calendarDays.slice(pageStart, pageStart + perPage);
  const hasPrev = pageStart > 0;
  const hasNext = pageStart + perPage < calendarDays.length;
  const now = new Date();

  /** その日のその時刻がすでに過ぎているか（ブラウザローカル＝日本向け） */
  const isPastHourOnDay = (day: Date, hour: string) => {
    const [h, m] = hour.split(":").map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m || 0, 0, 0);
    return at.getTime() <= now.getTime();
  };

  // 表示中の日のうち「まだこれから」の時刻だけ行にする（過ぎた時台は出さない）
  const hourSet = [
    ...new Set(
      days.flatMap((d) =>
        d.slots.map((s) => s.start).filter((h) => !isPastHourOnDay(d.date, h)),
      ),
    ),
  ].sort();
  const displayHours =
    hourSet.length > 0
      ? hourSet
      : HOURS.filter((h) => days.some((d) => !isPastHourOnDay(d.date, h)));

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
        {recommended.length === 0 ? (
          <p className="rounded-xl bg-slate-100 p-4 text-base text-slate-700">
            現時点でおすすめできる空き日程が見つかりませんでした。下のカレンダーからご確認ください。
          </p>
        ) : (
          <ul className="space-y-4">
            {recommended.map((slot, i) => (
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
        )}
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
                {days.length > 0
                  ? `${formatShortDate(days[0].date)}〜${formatShortDate(days[days.length - 1].date)}`
                  : "空きなし"}
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

            {days.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-600">表示できる空き日程がありません。</p>
            ) : (
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

                {displayHours.map((hour) => (
                  <Fragment key={hour}>
                    <div className="pt-1 text-right text-xs font-bold text-slate-500">{hour}</div>
                    {days.map((d) => {
                      if (isPastHourOnDay(d.date, hour)) {
                        return (
                          <div
                            key={`${d.date.toISOString()}-${hour}`}
                            className="min-h-14 rounded-lg bg-slate-50"
                            aria-hidden
                          />
                        );
                      }
                      const slot = d.slots.find((s) => s.start === hour);
                      return slot ? (
                        <button
                          key={`${d.date.toISOString()}-${hour}`}
                          type="button"
                          onClick={() => onSelect(slot)}
                          aria-label={`${formatSlot(slot)} を選ぶ`}
                          className="flex min-h-14 flex-col items-center justify-center rounded-lg bg-blue-900 leading-tight text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        >
                          <span className="text-base font-bold">{slot.start}</span>
                          <span className="text-xs">〜{slot.end}</span>
                        </button>
                      ) : (
                        <div key={`${d.date.toISOString()}-${hour}`} className="min-h-14 rounded-lg border border-dashed border-slate-200" />
                      );
                    })}
                    {perPage > days.length && <div style={{ gridColumn: `span ${perPage - days.length}` }} />}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ConfirmDialog({
  slot,
  values,
  confirming,
  error,
  onConfirm,
  onCancel,
}: {
  slot: Slot;
  values: FormValues;
  confirming?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirming && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, confirming]);

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
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            aria-label="閉じる"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
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
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-500">メール</dt>
            <dd className="font-bold">{values.email}</dd>
          </div>
        </dl>

        {error && (
          <p className="mb-3 text-sm font-bold text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            autoFocus
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-xl font-bold text-white hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-300 disabled:opacity-60"
          >
            {confirming ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : null}
            {confirming ? "確定中…" : "この内容で確定する"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-slate-300 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ほかの日時を選ぶ
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 3 ---------- */

function slotToIso(slot: Slot) {
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  const start = new Date(slot.date);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(slot.date);
  end.setHours(eh, em, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function DoneStep({ slot, values }: { slot: Slot; values: FormValues }) {
  const rows = [
    { icon: Calendar, label: "訪問日時", value: formatSlot(slot) },
    { icon: MapPin, label: "訪問先ご住所", value: values.address },
    { icon: Car, label: "駐車場", value: parkingLabel(values.parking) },
    { icon: Phone, label: "お電話番号", value: values.phone },
    { icon: Mail, label: "メールアドレス", value: values.email },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <CheckCircle className="h-20 w-20 text-green-600" aria-hidden />
        <h2 className="text-2xl font-bold text-slate-900">訪問調査のご予約が完了しました</h2>
        <p className="text-base text-slate-600">
          {values.name} 様、ありがとうございます。
          <br />
          前日に確認のメールをお送りします。
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
        <p className="text-base font-bold text-slate-800">キャンセル・日程変更について</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          キャンセル・変更はお電話にてご連絡ください。
          <br />
          オペレーターがキャンセル処理をしたあと、同じご案内URLから再度日程をお選びいただけます。
        </p>
      </section>
    </div>
  );
}

/* ---------- ページ ---------- */

export function BookingFlow({
  linkToken,
  workerIds,
  showAdminLink = false,
  mode = "customer",
  onRestart,
}: BookingFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<FormValues>({
    address: "",
    parking: "",
    phone: "",
    name: "",
    email: "",
  });
  const [pending, setPending] = useState<Slot | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const isStaff = mode === "staff";

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmBooking = async () => {
    if (!pending) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const { start, end } = slotToIso(pending);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: values.address,
          parking: values.parking,
          phone: values.phone,
          name: values.name,
          email: values.email,
          start,
          end,
          workerIds: pending.workerIds,
          linkToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "確定に失敗しました");
      setBooked(pending);
      setPending(null);
      go(3);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "確定に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className={`${isStaff ? "" : "min-h-screen"} bg-slate-50 font-sans text-slate-900`}>
      <header className="bg-blue-900 text-white">
        <div className="mx-auto max-w-xl px-4 pb-5 pt-6">
          <p className="text-sm font-bold tracking-widest text-orange-300">荒井硝子</p>
          {isStaff && (
            <p className="mt-1 inline-block rounded bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
              社内・代理入力
            </p>
          )}
          <h1 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">
            {isStaff ? "電話口・社内用 訪問調査 日程調整" : "お問合せ・訪問調査 日程調整"}
          </h1>
          <div className="mt-5">
            <StepIndicator step={step} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8">
        {step === 1 && <InputStep values={values} onChange={setValues} onSubmit={() => go(2)} />}

        {step === 2 && (
          <ScheduleStep
            address={values.address}
            linkToken={linkToken}
            workerIds={workerIds}
            onSelect={setPending}
            onBack={() => go(1)}
          />
        )}

        {step === 3 && booked && <DoneStep slot={booked} values={values} />}

        {isStaff && step === 3 && (
          <p className="mt-6 text-center text-sm">
            <a href="/admin/bookings" className="font-bold text-blue-900 underline-offset-2 hover:underline">
              予約一覧を見る
            </a>
            {onRestart && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={onRestart}
                  className="font-bold text-blue-900 underline-offset-2 hover:underline"
                >
                  続けて別件を調整
                </button>
              </>
            )}
          </p>
        )}
      </main>

      <footer className="space-y-2 pb-10 text-center text-xs text-slate-400">
        <p>日程調整ツール「調整君」</p>
        {showAdminLink && (
          <p>
            <a href="/admin" className="text-slate-500 underline-offset-2 hover:underline">
              社内管理
            </a>
          </p>
        )}
      </footer>

      {pending && (
        <ConfirmDialog
          slot={pending}
          values={values}
          confirming={confirming}
          error={confirmError}
          onCancel={() => {
            if (!confirming) {
              setPending(null);
              setConfirmError(null);
            }
          }}
          onConfirm={confirmBooking}
        />
      )}
    </div>
  );
}
