import type { AppSettings } from "../settings-shared";
import { isSearchableDay } from "../holidays";
import type { CalendarEvent, LatLng, PublicSlot, SlotCandidate, Worker } from "../types";
import { TravelTimeCache, getDriveMinutes } from "./travel";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * 就業時間内の候補開始時刻のみ列挙。
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
    const start = new Date(day);
    start.setHours(h, minutes % 60, 0, 0);
    starts.push(start);
  }
  return starts;
}

function siteEvents(events: CalendarEvent[]) {
  return events.filter((e) => e.kind === "site" && e.latLng);
}

/** Busy（移動等）＋現地予定の時間帯はすべて塞がり */
function blockingEvents(events: CalendarEvent[]) {
  return events;
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
  const dayStart = startOfDay(slotStart);
  dayStart.setHours(settings.workdayStartHour, 0, 0, 0);
  return { at: dayStart, latLng: office };
}

function findAnchorB(events: CalendarEvent[], slotEnd: Date): { at: Date; latLng: LatLng } | null {
  const sites = siteEvents(events)
    .filter((e) => e.start >= slotEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (sites[0]?.latLng) return { at: sites[0].start, latLng: sites[0].latLng };
  return null;
}

function isBlocked(events: CalendarEvent[], slotStart: Date, slotEnd: Date) {
  return blockingEvents(events).some((e) => overlaps(slotStart, slotEnd, e.start, e.end));
}

export type GapSearchInput = {
  customerLatLng: LatLng;
  workers: Worker[];
  eventsByWorker: Map<string, CalendarEvent[]>;
  fromDate: Date;
  settings: AppSettings;
};

/**
 * 段階探索つき間検索。
 * - requireTwoWorkers 時は同時刻に2人空いている枠のみ採用
 * - 担当優先度は同時刻のタイブレーカー（早い枠を殺さない）
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

  let daysScanned = 0;
  const endExclusive = addDays(startOfDay(input.fromDate), settings.maxSearchDays);

  for (let day = startOfDay(input.fromDate); day < endExclusive; day = addDays(day, 1)) {
    if (!isSearchableDay(day, settings)) continue;
    daysScanned += 1;

    for (const start of candidateStartsOnDay(day, settings)) {
      if (start < new Date()) continue;
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

        const travelIn = await getDriveMinutes(a.latLng, input.customerLatLng, cache);
        const travelOut = b ? await getDriveMinutes(input.customerLatLng, b.latLng, cache) : 0;
        const direct = b ? await getDriveMinutes(a.latLng, b.latLng, cache) : 0;
        const viaCustomer = travelIn + travelOut;
        const deltaT = b ? Math.max(0, viaCustomer - direct) : 0;

        if (deltaT >= settings.detourThresholdMinutes) continue;

        const needed = travelIn + settings.surveyMinutes + travelOut + settings.bufferMinutes;

        const windowEnd = b
          ? b.at
          : (() => {
              const eod = startOfDay(start);
              eod.setHours(settings.workdayEndHour, 0, 0, 0);
              return eod;
            })();

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

    const earliestThree = [...candidates]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, settings.recommendedCount);

    if (daysScanned >= settings.initialSearchDays && earliestThree.length >= settings.recommendedCount) {
      break;
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
    const key = c.start.toISOString().slice(0, 10);
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
