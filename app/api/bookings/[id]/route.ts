import { NextResponse } from "next/server";
import { removeBookingFromCalendars } from "@/lib/providers/calendar-sync";
import { cancelBooking, loadBookings } from "@/lib/store";

export async function PATCH(req: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: string };

    if (body.status !== "cancelled") {
      return NextResponse.json({ error: "status は cancelled のみ対応です" }, { status: 400 });
    }

    // キャンセル前にイベントIDを控える
    const before = (await loadBookings()).find((b) => b.id === id);
    const booking = await cancelBooking(id);
    if (before) {
      try {
        await removeBookingFromCalendars(before);
      } catch (e) {
        console.error("[api/bookings] calendar remove failed", e);
      }
    }
    return NextResponse.json({ booking });
  } catch (e) {
    const message = e instanceof Error ? e.message : "キャンセルに失敗しました";
    console.error("[api/bookings PATCH]", e);
    const status = message.includes("見つかりません") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
