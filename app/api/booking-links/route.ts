import { NextResponse } from "next/server";
import { createBookingLink, loadBookingLinks } from "@/lib/store";

export async function GET() {
  try {
    const links = await loadBookingLinks();
    return NextResponse.json({ links });
  } catch (e) {
    console.error("[api/booking-links GET]", e);
    return NextResponse.json({ error: "URL一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { workerIds?: string[]; note?: string };
    const link = await createBookingLink({
      workerIds: Array.isArray(body.workerIds) ? body.workerIds : [],
      note: body.note,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "URLの発行に失敗しました";
    console.error("[api/booking-links POST]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
