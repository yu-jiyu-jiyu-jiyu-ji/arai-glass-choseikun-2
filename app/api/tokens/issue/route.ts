import { NextResponse } from "next/server";
import { createBookingLink } from "@/lib/store";
import type { AssignmentMode } from "@/lib/types";

function authorized(req: Request): boolean {
  const key = process.env.TOKENS_ISSUE_API_KEY?.trim();
  if (!key) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${key}`) return true;
  return req.headers.get("x-api-key") === key;
}

/**
 * 外部Bot向けワンタイムURL発行
 * Body: { targetUserIds, assignmentMode, customerPreset? }
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      targetUserIds?: string[];
      assignmentMode?: AssignmentMode;
      customerPreset?: {
        name?: string;
        phone?: string;
        email?: string;
        address?: string;
      };
      note?: string;
    };

    const workerIds = Array.isArray(body.targetUserIds) ? body.targetUserIds : [];
    if (workerIds.length === 0) {
      return NextResponse.json({ error: "targetUserIds は必須です" }, { status: 400 });
    }
    const assignmentMode = body.assignmentMode === "single" ? "single" : "pair";
    if (assignmentMode === "pair" && workerIds.length < 2) {
      return NextResponse.json(
        { error: "pair モードでは targetUserIds を2名以上指定してください" },
        { status: 400 },
      );
    }

    const link = await createBookingLink({
      workerIds,
      assignmentMode,
      customerPreset: body.customerPreset,
      note: body.note ?? "api/tokens/issue",
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
      process.env.RENDER_EXTERNAL_URL?.trim() ||
      new URL(req.url).origin;
    const url = `${origin.replace(/\/$/, "")}/reserve?token=${encodeURIComponent(link.token)}`;

    return NextResponse.json(
      {
        token: link.token,
        url,
        assignmentMode: link.assignmentMode,
        workerIds: link.workerIds,
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "発行に失敗しました";
    console.error("[api/tokens/issue]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
