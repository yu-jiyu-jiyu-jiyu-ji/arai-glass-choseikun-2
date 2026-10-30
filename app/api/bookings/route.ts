import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import { pushBookingToCalendars } from "@/lib/providers/calendar-sync";
import { createBooking, loadBookings, saveBookingCalendarEventIds } from "@/lib/store";
import type { BookingRequest, BookingResponse } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const workerId = searchParams.get("workerId");
    const date = searchParams.get("date"); // YYYY-MM-DD

    let bookings = await loadBookings();

    if (status === "confirmed" || status === "cancelled") {
      bookings = bookings.filter((b) => b.status === status);
    }
    if (workerId) {
      bookings = bookings.filter((b) => b.workerIds.includes(workerId));
    }
    if (date) {
      bookings = bookings.filter((b) => b.start.slice(0, 10) === date);
    }
    if (q) {
      bookings = bookings.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.phone.includes(q) ||
          b.email.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q),
      );
    }

    return NextResponse.json({ bookings });
  } catch (e) {
    console.error("[api/bookings GET]", e);
    return NextResponse.json({ error: "予約一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookingRequest;

    const required = ["address", "parking", "phone", "name", "email", "start", "end"] as const;
    for (const key of required) {
      if (!body[key]) {
        return NextResponse.json({ error: `${key} は必須です` }, { status: 400 });
      }
    }

    const booking = await createBooking(body);

    // 予約保存後に担当カレンダーへ書き込み（失敗しても予約は確定のまま）
    try {
      const calendarEventIds = await pushBookingToCalendars(booking);
      await saveBookingCalendarEventIds(booking.id, calendarEventIds);
    } catch (e) {
      console.error("[api/bookings] calendar sync failed", e);
    }

    const response: BookingResponse = {
      id: booking.id,
      status: booking.status,
      mode: APP_CONFIG.useMockProviders ? "mock" : "live",
      linkToken: booking.linkToken,
    };

    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "予約の確定に失敗しました";
    console.error("[api/bookings POST]", e);
    const status = message.includes("すでに予約") || message.includes("無効") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
