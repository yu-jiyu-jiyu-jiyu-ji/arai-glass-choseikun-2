import { NextResponse } from "next/server";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings";

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<AppSettings>;
    const settings = await saveSettings(body);
    return NextResponse.json(settings);
  } catch (e) {
    console.error("[api/settings]", e);
    return NextResponse.json({ error: "設定の保存に失敗しました" }, { status: 500 });
  }
}
