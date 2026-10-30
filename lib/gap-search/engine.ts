import type { AppSettings } from "../settings-shared";
import { isSearchableDay } from "../holidays";
import {
  addJstDays,
  jstDateKey,
  jstWallOnSameDay,
  startOfJstDay,
} from "../time/jst";
import type { CalendarEvent, LatLng, PublicSlot, SlotCandidate, Worker } from "../types";
import { TravelTimeCache, getDriveMinutes } from "./travel";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * 就業時間内の候補開始時刻のみ列挙（JST）。
 * 「開始＋調査時間が終了時刻を超える」枠は出さない。
 */
function candidateStartsOnDay(day: Date, settings: AppSettings): Date[] {
  const starts: Date[] = [];
  const {
    workdayStartHour,
    workdayEndHour,
    lunchStartHour,
    lunchEndHour,
    slotIntervalMinutes,
    surveyMinutes,
  } = settings;

  const dayEndMinutes = workdayEndHour * 60;
  for (
    let minutes = workdayStartHour * 60;
    minutes + surveyMinutes <= dayEndMinutes;
    minutes += slotIntervalMinutes
  ) {
    const h = Math.floor(minutes / 60);
    if (h >= lunchStartHour && h < lunchEndHour) continue;
    starts.push(jstWallOnSameDay(day, h, minutes % 60));
  }
  return starts;
}

function siteEvents(events: CalendarEvent[]) {
  return events.filter((e) => e.kind === "site" && e.latLng);
}

/** Busy（移動・住所なし等）＋現地予定の時間帯はすべて塞がり */
function isBlocked(events: CalendarEvent[], slotStart: Date, slotEnd: Date) {
  return events.some((e) => overlaps(slotStart, slotEnd, e.start, e.end));
}

function findAnchorA(
  events: CalendarEvent[],
  slotStart: Date,
  office: LatLng,
  settings: AppSettings,
): { at: Date; latLng: LatLng } {
  const sites = siteEvents(events)
    .filter((e) => e.end <= slotStart)
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  if (sites[0]?.latLng) return { at: sites[0].end, latLng: sites[0].latLng };
  return {
    at: jstWallOnSameDay(slotStart, settings.workdayStartHour, 0),
    latLng: office,
  };
}

function findAnchorB(events: CalendarEvent[], slotEnd: Date): { at: Date; latLng: LatLng } | null {
  const sites = siteEvents(events)
    .filter((e) => e.start >= slotEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (sites[0]?.latLng) return { at: sites[0].start, latLng: sites[0].latLng };
  return null;
}

export type GapSearchInput = {
  customerLatLng: LatLng;
  workers: Worker[];
  eventsByWorker: Map<string, CalendarEvent[]>;
  fromDate: Date;
  settings: AppSettings;
  /** 本番 Maps。未指定時はハバーサイン概算 */
  driveFetcher?: (from: LatLng, to: LatLng) => Promise<number>;
};

/**
 * 段階探索つき間検索。
 * - requireTwoWorkers 時は同時刻に2人空いている枠のみ採用
 * - 担当優先度は同時刻のタイブレーカー（早い枠を殺さない）
 * - 時刻・日付は Asia/Tokyo
 */
export async function runGapSearch(input: GapSearchInput): Promise<{
  candidates: SlotCandidate[];
  daysScanned: number;
}> {
  const { settings } = input;
  const office = settings.officeLatLng;
  const cache = new TravelTimeCache();
  const candidates: SlotCandidate[] = [];
  const activeWorkers = input.workers.filter((w) => w.active);
  const now = new Date();

  let daysScanned = 0;
  /** おすすめ枠が揃ったあとの延長探索の起点（searchable day カウント） */
  let extendFromScanned: number | null = null;
  const rangeStart = startOfJstDay(input.fromDate);
  const endExclusive = addJstDays(rangeStart, settings.maxSearchDays);

  for (let day = rangeStart; day < endExclusive; day = addJstDays(day, 1)) {
    if (!isSearchableDay(day, settings)) continue;
    daysScanned += 1;

    for (const start of candidateStartsOnDay(day, settings)) {
      // 現在時刻より前の枠は出さない（TimeRex 同様）
      if (start.getTime() <= now.getTime()) continue;
      const end = new Date(start.getTime() + settings.surveyMinutes * 60_000);

      type Scored = {
        workerId: string;
        deltaTMinutes: number;
        travelInMinutes: number;
        travelOutMinutes: number;
        score: number;
      };
      const scored: Scored[] = [];

      for (const worker of activeWorkers) {
        const events = input.eventsByWorker.get(worker.id) ?? [];
        if (isBlocked(events, start, end)) continue;

        const a = findAnchorA(events, start, office, settings);
        const b = findAnchorB(events, end);

        const travelIn = await getDriveMinutes(
          a.latLng,
          input.customerLatLng,
          cache,
          input.driveFetcher,
        );
        const travelOut = b
          ? await getDriveMinutes(input.customerLatLng, b.latLng, cache, input.driveFetcher)
          : 0;
        const direct = b
          ? await getDriveMinutes(a.latLng, b.latLng, cache, input.driveFetcher)
          : 0;
        const viaCustomer = travelIn + travelOut;
        const deltaT = b ? Math.max(0, viaCustomer - direct) : 0;

        if (deltaT >= settings.detourThresholdMinutes) continue;

        const needed = travelIn + settings.surveyMinutes + travelOut + settings.bufferMinutes;

        const windowEnd = b
          ? b.at
          : jstWallOnSameDay(start, settings.workdayEndHour, 0);

        const available = (windowEnd.getTime() - a.at.getTime()) / 60_000;
        if (needed > available) continue;

        const score = travelIn * 2 + deltaT * 3 + (worker.surveyMain ? 0 : 15);

        scored.push({
          workerId: worker.id,
          deltaTMinutes: deltaT,
          travelInMinutes: travelIn,
          travelOutMinutes: travelOut,
          score,
        });
      }

      scored.sort((x, y) => x.score - y.score);

      if (settings.requireTwoWorkers) {
        if (scored.length < 2) continue;
        const [first, second] = scored;
        candidates.push({
          start,
          end,
          workerIds: [first.workerId, second.workerId],
          deltaTMinutes: Math.max(first.deltaTMinutes, second.deltaTMinutes),
          travelInMinutes: first.travelInMinutes,
          travelOutMinutes: first.travelOutMinutes,
        });
      } else if (scored[0]) {
        candidates.push({
          start,
          end,
          workerIds: [scored[0].workerId],
          deltaTMinutes: scored[0].deltaTMinutes,
          travelInMinutes: scored[0].travelInMinutes,
          travelOutMinutes: scored[0].travelOutMinutes,
        });
      }
    }

    const earliestEnough = [...candidates]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, settings.recommendedCount);

    // 段階探索:
    // 1) 最低 initialSearchDays は見る
    // 2) おすすめ枠が揃ったら、カレンダー用に extendSearchDays 分だけ延長して止める
    //    （「初回空きが遠い日」でも、その直後の日を切り捨てない）
    if (earliestEnough.length >= settings.recommendedCount) {
      if (daysScanned >= settings.initialSearchDays) {
        if (extendFromScanned === null) extendFromScanned = daysScanned;
        if (daysScanned - extendFromScanned >= settings.extendSearchDays) {
          break;
        }
      }
    }
  }

  return { candidates, daysScanned };
}

export function toPublicResponse(
  candidates: SlotCandidate[],
  daysScanned: number,
  workersConsidered: number,
  recommendedCount: number,
): {
  recommended: PublicSlot[];
  days: { date: string; slots: PublicSlot[] }[];
  searchedDays: number;
  workersConsidered: number;
} {
  const sorted = [...candidates].sort((a, b) => {
    const t = a.start.getTime() - b.start.getTime();
    if (t !== 0) return t;
    return a.deltaTMinutes - b.deltaTMinutes;
  });

  const recommended = sorted.slice(0, recommendedCount).map((c) => ({
    start: c.start.toISOString(),
    end: c.end.toISOString(),
    workerIds: c.workerIds,
  }));

  const byDate = new Map<string, PublicSlot[]>();
  for (const c of sorted) {
    const key = jstDateKey(c.start);
    const list = byDate.get(key) ?? [];
    list.push({
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      workerIds: c.workerIds,
    });
    byDate.set(key, list);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, slots }));

  return { recommended, days, searchedDays: daysScanned, workersConsidered };
}
