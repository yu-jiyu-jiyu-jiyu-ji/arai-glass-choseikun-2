import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import { runGapSearch, toPublicResponse } from "@/lib/gap-search/engine";
import { buildMockEvents, hasDetailedAddress, mockGeocode } from "@/lib/providers/mock";
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

    const workers = (
      poolIds?.length
        ? allWorkers.filter((w) => poolIds!.includes(w.id) && w.active)
        : allWorkers.filter((w) => w.active)
    ).sort((a, b) => Number(b.surveyMain) - Number(a.surveyMain));

    if (workers.length === 0) {
      return NextResponse.json({ error: "候補となる職人がいません" }, { status: 400 });
    }

    const eventsByWorker = buildMockEvents();
    const customerLatLng = mockGeocode(address);

    const { candidates, daysScanned } = await runGapSearch({
      customerLatLng,
      workers,
      eventsByWorker,
      fromDate: new Date(),
      settings,
    });

    const result = toPublicResponse(
      candidates,
      daysScanned,
      workers.length,
      settings.recommendedCount,
    );

    // workerIds は確定時アサイン用（顧客UIには表示しない）
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
    return NextResponse.json({ error: "候補の検索に失敗しました" }, { status: 500 });
  }
}
