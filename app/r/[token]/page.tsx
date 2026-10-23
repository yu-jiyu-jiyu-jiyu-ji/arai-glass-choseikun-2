"use client";

import { Suspense, use, useEffect, useState } from "react";
import {
  Calendar,
  Car,
  CheckCircle,
  Loader2,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { BookingFlow } from "@/components/booking-flow";
import type { Booking, Parking } from "@/lib/types";

type LinkPayload = {
  link: { token: string; workerIds: string[]; note: string };
  booking: (Booking & { workerNames?: string[] }) | null;
};

const PARKING_LABEL: Record<Parking, string> = {
  onsite: "敷地内あり",
  coin: "近隣コインパーキングあり",
  front: "家の前・私道に駐車可",
  none: "なし",
};

function formatSlot(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const week = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${s.getMonth() + 1}月${s.getDate()}日(${week[s.getDay()]}) ${pad(s.getHours())}:${pad(s.getMinutes())}〜${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-600">
      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
      読み込み中…
    </div>
  );
}

function ConfirmedView({ booking }: { booking: Booking & { workerNames?: string[] } }) {
  const rows = [
    { icon: Calendar, label: "訪問日時", value: formatSlot(booking.start, booking.end) },
    { icon: MapPin, label: "訪問先ご住所", value: booking.address },
    { icon: Car, label: "駐車場", value: PARKING_LABEL[booking.parking] },
    { icon: Phone, label: "お電話番号", value: booking.phone },
    { icon: Mail, label: "メールアドレス", value: booking.email },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-blue-900 text-white">
        <div className="mx-auto max-w-xl px-4 pb-5 pt-6">
          <p className="text-sm font-bold tracking-widest text-orange-300">荒井硝子</p>
          <h1 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">訪問調査のご予約内容</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-8 px-4 py-8">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <CheckCircle className="h-16 w-16 text-green-600" aria-hidden />
          <h2 className="text-2xl font-bold text-slate-900">ご予約が確定しています</h2>
          <p className="text-base text-slate-600">{booking.name} 様</p>
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
      </main>
    </div>
  );
}

function CustomerLinkInner({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "error" | "confirmed" | "open">("loading");
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<(Booking & { workerNames?: string[] }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(token)}`);
        const data = (await res.json()) as LinkPayload & { error?: string };
        if (!res.ok) throw new Error(data.error || "URLが無効です");
        if (cancelled) return;
        if (data.booking) {
          setBooking(data.booking);
          setState("confirmed");
        } else {
          setState("open");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "読み込みに失敗しました");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") return <LoadingScreen />;

  if (state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-bold text-red-600" role="alert">
          {error}
        </p>
        <p className="text-sm text-slate-600">お手数ですが、お電話にてお問い合わせください。</p>
      </div>
    );
  }

  if (state === "confirmed" && booking) {
    return <ConfirmedView booking={booking} />;
  }

  return <BookingFlow linkToken={token} />;
}

function TokenFromParams({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <CustomerLinkInner token={token} />;
}

export default function CustomerLinkPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TokenFromParams params={params} />
    </Suspense>
  );
}
