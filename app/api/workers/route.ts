import { NextResponse } from "next/server";
import { loadWorkers, upsertWorker } from "@/lib/store";
import type { Worker } from "@/lib/types";

export async function GET() {
  try {
    const workers = await loadWorkers();
    return NextResponse.json({ workers });
  } catch (e) {
    console.error("[api/workers GET]", e);
    return NextResponse.json({ error: "職人一覧の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Worker> & { name?: string; googleEmail?: string };
    if (!body.name?.trim() || !body.googleEmail?.trim()) {
      return NextResponse.json({ error: "氏名と Googleメールは必須です" }, { status: 400 });
    }
    const worker = await upsertWorker({
      name: body.name.trim(),
      googleEmail: body.googleEmail.trim(),
      oauthLinked: body.oauthLinked,
      surveyMain: body.surveyMain,
      active: body.active,
      calendarId: body.calendarId,
    });
    return NextResponse.json({ worker }, { status: 201 });
  } catch (e) {
    console.error("[api/workers POST]", e);
    return NextResponse.json({ error: "職人の登録に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<Worker> & { id?: string; name?: string; googleEmail?: string };
    if (!body.id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }
    if (!body.name?.trim() || !body.googleEmail?.trim()) {
      return NextResponse.json({ error: "氏名と Googleメールは必須です" }, { status: 400 });
    }
    const worker = await upsertWorker({
      id: body.id,
      name: body.name.trim(),
      googleEmail: body.googleEmail.trim(),
      oauthLinked: body.oauthLinked,
      surveyMain: body.surveyMain,
      active: body.active,
      calendarId: body.calendarId,
    });
    return NextResponse.json({ worker });
  } catch (e) {
    const message = e instanceof Error ? e.message : "職人の更新に失敗しました";
    console.error("[api/workers PUT]", e);
    const status = message.includes("見つかりません") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
