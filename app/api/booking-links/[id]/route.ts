import { NextResponse } from "next/server";
import { deleteBookingLink } from "@/lib/store";

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/booking-links/[id]">,
) {
  try {
    const { id } = await ctx.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    }
    await deleteBookingLink(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "URLの削除に失敗しました";
    console.error("[api/booking-links DELETE]", e);
    const status = message.includes("見つかりません") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
