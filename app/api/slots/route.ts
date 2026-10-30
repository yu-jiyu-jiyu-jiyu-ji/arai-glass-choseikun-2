import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import { runGapSearch, toPublicResponse } from "@/lib/gap-search/engine";
import { hasDetailedAddress } from "@/lib/providers/mock";
import {
  createDriveFetcher,
  loadEventsByWorker,
  resolveCustomerLatLng,
} from "@/lib/providers/live";
import { loadSettings } from "@/lib/settings";
import { getBookingLinkByToken, loadWorkers } from "@/lib/store";
import type { SearchSlotsRequest, SearchSlotsResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SearchSlotsRequest;
    const address = body.address?.trim() ?? "";
    const settings = await loadSettings();
    const allWorkers = await loadWorkers();

    if (!address) {
      return NextResponse.json({ error: "ご住所は必須です" }, { status: 400 });
    }
    if (!hasDetailedAddress(address)) {
      return NextResponse.json(
        { error: "ご住所は丁目・番地・号までご入力ください（例: 東京都台東区寿3-9-6）" },
        { status: 400 },
      );
    }

    let poolIds = body.workerIds;
    if (body.linkToken) {
      const link = await getBookingLinkByToken(body.linkToken);
      if (!link) {
        return NextResponse.json({ error: "ご案内URLが無効です" }, { status: 404 });
      }
      poolIds = link.workerIds;
    }

    let workers = (
      poolIds?.length
        ? allWorkers.filter((w) => poolIds!.includes(w.id) && w.active)
        : allWorkers.filter((w) => w.active)
    ).sort((a, b) => Number(b.surveyMain) - Number(a.surveyMain));

    // 本番プロバイダ時は OAuth 済みのみ候補に使う（未連携は空き検索できない）
    if (!APP_CONFIG.useMockProviders) {
      workers = workers.filter((w) => w.oauthLinked);
    }

    if (workers.length === 0) {
      return NextResponse.json(
        {
          error: APP_CONFIG.useMockProviders
            ? "候補となる職人がいません"
            : "OAuth 連携済みの職人がいません。管理画面でカレンダー連携してください。",
        },
        { status: 400 },
      );
    }

    const customerLatLng = await resolveCustomerLatLng(address);
    const eventsByWorker = await loadEventsByWorker(
      workers,
      new Date(),
      settings.maxSearchDays,
    );

    const { candidates, daysScanned } = await runGapSearch({
      customerLatLng,
      workers,
      eventsByWorker,
      fromDate: new Date(),
      settings,
      driveFetcher: createDriveFetcher(),
    });

    const result = toPublicResponse(
      candidates,
      daysScanned,
      workers.length,
      settings.recommendedCount,
    );

    const response: SearchSlotsResponse = {
      recommended: result.recommended,
      days: result.days,
      meta: {
        mode: APP_CONFIG.useMockProviders ? "mock" : "live",
        searchedDays: result.searchedDays,
        workersConsidered: result.workersConsidered,
      },
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("[api/slots]", e);
    const message = e instanceof Error ? e.message : "候補の検索に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
