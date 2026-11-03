import { NextResponse } from "next/server";
import { sendBookingNotifications } from "@/lib/mail/booking-notify";
import { mailConfigured } from "@/lib/mail/smtp";
import { loadBookings } from "@/lib/store";

/** 予約通知メールの再送（切り分け・取りこぼし救済） */
export async function POST(_req: Request, ctx: RouteContext<"/api/bookings/[id]/notify">) {
  try {
    const { id } = await ctx.params;
    if (!mailConfigured()) {
      return NextResponse.json(
        {
          error:
            "メール送信が未設定です（RESEND_API_KEY または SMTP_HOST / SMTP_USER / SMTP_PASSWORD）",
        },
        { status: 503 },
      );
    }
    const booking = (await loadBookings()).find((b) => b.id === id);
    if (!booking) {
      return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
    }
    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "確定済みの予約のみ再送できます" }, { status: 400 });
    }
    const mail = await sendBookingNotifications(booking);
    const anyOk =
      mail.staff.some((s) => s.ok) || Boolean(mail.customer?.ok);
    return NextResponse.json({ ok: anyOk, bookingId: booking.id, mail }, { status: anyOk ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "メール再送に失敗しました";
    console.error("[api/bookings notify]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
