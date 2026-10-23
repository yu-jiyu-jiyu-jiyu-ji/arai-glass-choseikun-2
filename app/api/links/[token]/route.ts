import { NextResponse } from "next/server";
import {
  getBookingLinkByToken,
  getConfirmedBookingForLink,
  loadWorkers,
} from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/links/[token]">) {
  try {
    const { token } = await ctx.params;
    const link = await getBookingLinkByToken(token);
    if (!link) {
      return NextResponse.json({ error: "ご案内URLが無効です" }, { status: 404 });
    }

    const booking = await getConfirmedBookingForLink(token);
    const workers = await loadWorkers();
    const workerNames = Object.fromEntries(workers.map((w) => [w.id, w.name]));

    return NextResponse.json({
      link: {
        token: link.token,
        workerIds: link.workerIds,
        note: link.note,
        createdAt: link.createdAt,
      },
      booking: booking
        ? {
            ...booking,
            workerNames: booking.workerIds.map((id) => workerNames[id] ?? id),
          }
        : null,
    });
  } catch (e) {
    console.error("[api/links GET]", e);
    return NextResponse.json({ error: "リンク情報の取得に失敗しました" }, { status: 500 });
  }
}
