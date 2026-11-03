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

/** 現地としてカレンダー／塞がりに使う分（調査＋調査後バッファ） */
function siteBlockMinutes(settings: AppSettings) {
  return settings.surveyMinutes + (settings.bufferMinutes ?? 0);
}

/**
 * 就業時間内の候補開始時刻のみ列挙（JST）。
 * 「開始＋現地ブロック（調査＋調査後バッファ）が就業終了を超える」枠は出さない。
 */
function candidateStartsOnDay(day: Date, settings: AppSettings): Date[] {
  const starts: Date[] = [];
  const {
    workdayStartHour,
    workdayEndHour,
    lunchStartHour,
    lunchEndHour,
    slotIntervalMinutes,
  } = settings;
  const block = siteBlockMinutes(settings);
  const dayEndMinutes = workdayEndHour * 60;
  for (
    let minutes = workdayStartHour * 60;
    minutes + block <= dayEndMinutes;
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

/** スロット後の最初の予定開始（移動の衝突回避用） */
function nextEventStart(events: CalendarEvent[], after: Date): Date | null {
  const hits = events
    .filter((e) => e.start >= after)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return hits[0]?.start ?? null;
}

/** スロット直前の予定（就業開始以降） */
function prevEventBefore(
  events: CalendarEvent[],
  slotStart: Date,
  dayStart: Date,
): CalendarEvent | null {
  const hits = events
    .filter((e) => e.end <= slotStart && e.end.getTime() >= dayStart.getTime())
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  return hits[0] ?? null;
}

function findAnchorA(
  events: CalendarEvent[],
  slotStart: Date,
  office: LatLng,
  settings: AppSettings,
): { at: Date; latLng: LatLng; fromSite: boolean } {
  const dayStart = jstWallOnSameDay(slotStart, settings.workdayStartHour, 0);
  const sites = siteEvents(events)
    .filter((e) => e.end <= slotStart && e.end.getTime() >= dayStart.getTime())
    .sort((a, b) => b.end.getTime() - a.end.getTime());
  if (sites[0]?.latLng) {
    return { at: sites[0].end, latLng: sites[0].latLng, fromSite: true };
  }
  return { at: dayStart, latLng: office, fromSite: false };
}

function findAnchorB(
  events: CalendarEvent[],
  siteBlockEnd: Date,
  office: LatLng,
  settings: AppSettings,
): { at: Date; latLng: LatLng; isOffice: boolean } {
  const dayEnd = jstWallOnSameDay(siteBlockEnd, settings.workdayEndHour, 0);
  const sites = siteEvents(events)
    .filter((e) => e.start >= siteBlockEnd && e.start.getTime() <= dayEnd.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (sites[0]?.latLng) {
    return { at: sites[0].start, latLng: sites[0].latLng, isOffice: false };
  }
  return { at: dayEnd, latLng: office, isOffice: true };
}

export type GapSearchInput = {
  customerLatLng: LatLng;
  workers: Worker[];
  eventsByWorker: Map<string, CalendarEvent[]>;
  fromDate: Date;
  settings: AppSettings;
  /** リンク発行時の必要人数。未指定なら settings.requireTwoWorkers */
  requireTwoWorkers?: boolean;
  /** 本番 Maps。未指定時はハバーサイン概算 */
  driveFetcher?: (from: LatLng, to: LatLng) => Promise<number>;
};

/**
 * 間検索（最大探索日数まで走査）。
 * - 現地ブロック = 調査 + 調査後バッファ（就業内に収める）
 * - 作業前移動 = Maps + 移動バッファ（直前現地 or 事務所。ブロック後も事務所起点）
 * - 作業後移動 = 次現地があるときのみ枠判定に使用。帰社所要では枠を落とさない
 * - 移動はカレンダー非表示（計算のみ）
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
  const travelBuffer = settings.travelBufferMinutes ?? 0;
  const siteBlock = siteBlockMinutes(settings);

  let daysScanned = 0;
  const rangeStart = startOfJstDay(input.fromDate);
  const endExclusive = addJstDays(rangeStart, settings.maxSearchDays);

  for (let day = rangeStart; day < endExclusive; day = addJstDays(day, 1)) {
    if (!isSearchableDay(day, settings)) continue;
    daysScanned += 1;

    for (const start of candidateStartsOnDay(day, settings)) {
      if (start.getTime() <= now.getTime()) continue;
      // 顧客向け枠の終了 = 調査時間のみ（バッファは現地ブロック側）
      const end = new Date(start.getTime() + settings.surveyMinutes * 60_000);
      const siteBlockEnd = new Date(start.getTime() + siteBlock * 60_000);

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
        // 現地ブロック全体が既存予定と被らないこと
        if (isBlocked(events, start, siteBlockEnd)) continue;

        const a = findAnchorA(events, start, office, settings);
        const b = findAnchorB(events, siteBlockEnd, office, settings);

        const travelIn = await getDriveMinutes(
          a.latLng,
          input.customerLatLng,
          cache,
          input.driveFetcher,
        );
        const travelOut = await getDriveMinutes(
          input.customerLatLng,
          b.latLng,
          cache,
          input.driveFetcher,
        );
        const direct = b.isOffice
          ? 0
          : await getDriveMinutes(a.latLng, b.latLng, cache, input.driveFetcher);
        const viaCustomer = travelIn + travelOut;
        const deltaT = b.isOffice ? 0 : Math.max(0, viaCustomer - direct);

        if (!b.isOffice && deltaT >= settings.detourThresholdMinutes) continue;

        const dayStart = jstWallOnSameDay(start, settings.workdayStartHour, 0);
        const prev = prevEventBefore(events, start, dayStart);
        const inNeed = travelIn + travelBuffer;

        /**
         * 作業前移動（Maps＋移動バッファ）:
         * - 直前現地 → そこから
         * - それ以外（朝空き／ブロック・会議のあと）→ 事務所から
         *   ブロック後も移動が必要なので earliestLeave = 直前終了 or 就業開始
         */
        const earliestLeave = a.fromSite
          ? a.at
          : prev
            ? prev.end > dayStart
              ? prev.end
              : dayStart
            : dayStart;
        const travelInStart = new Date(start.getTime() - inNeed * 60_000);
        if (travelInStart < earliestLeave) continue;
        if (travelInStart < dayStart) continue;
        if (isBlocked(events, travelInStart, start)) continue;

        const busyDeadline = nextEventStart(events, siteBlockEnd);
        const outDeadline =
          busyDeadline && busyDeadline < b.at ? busyDeadline : b.at;

        // 現地ブロックが次予定／就業終了までに収まること
        if (siteBlockEnd > outDeadline) continue;

        if (!b.isOffice) {
          // 次が現地: 現地ブロック後の移動（Maps＋移動バッファ）が次現地までに収まること
          const travelOutEnd = new Date(
            siteBlockEnd.getTime() + (travelOut + travelBuffer) * 60_000,
          );
          if (travelOutEnd > outDeadline) continue;
          if (isBlocked(events, siteBlockEnd, travelOutEnd)) continue;
        }
        // 帰社: 所要では枠を落とさない（現地ブロックが就業内／次予定前ならOK）

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

      const needTwo = input.requireTwoWorkers ?? settings.requireTwoWorkers;
      if (needTwo) {
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
  }

  return { candidates, daysScanned };
}

/** 就業時間内の候補開始ラベル（HH:mm）。昼休みは除く */
export function listWorkHourLabels(settings: AppSettings): string[] {
  const labels: string[] = [];
  const {
    workdayStartHour,
    workdayEndHour,
    lunchStartHour,
    lunchEndHour,
    slotIntervalMinutes,
  } = settings;
  const block = siteBlockMinutes(settings);
  const dayEndMinutes = workdayEndHour * 60;
  for (
    let minutes = workdayStartHour * 60;
    minutes + block <= dayEndMinutes;
    minutes += slotIntervalMinutes
  ) {
    const h = Math.floor(minutes / 60);
    if (h >= lunchStartHour && h < lunchEndHour) continue;
    const m = minutes % 60;
    labels.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return labels;
}

/** fromDate から searchable な日を count 日分（JST） */
export function listSearchableDateKeys(
  fromDate: Date,
  count: number,
  settings: AppSettings,
  hardMaxCalendarDays = 60,
): string[] {
  const keys: string[] = [];
  let day = startOfJstDay(fromDate);
  for (let i = 0; i < hardMaxCalendarDays && keys.length < count; i += 1) {
    if (isSearchableDay(day, settings)) keys.push(jstDateKey(day));
    day = addJstDays(day, 1);
  }
  return keys;
}

export function toPublicResponse(
  candidates: SlotCandidate[],
  daysScanned: number,
  workersConsidered: number,
  recommendedCount: number,
  opts?: {
    fromDate?: Date;
    settings?: AppSettings;
    /** TimeRex に必ず並べる searchable 日数（直近から）。缺け日は空き0 */
    calendarSearchableDays?: number;
  },
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

  const days: { date: string; slots: PublicSlot[] }[] = [];
  const seen = new Set<string>();

  if (opts?.fromDate && opts.settings && (opts.calendarSearchableDays ?? 0) > 0) {
    for (const key of listSearchableDateKeys(
      opts.fromDate,
      opts.calendarSearchableDays!,
      opts.settings,
    )) {
      days.push({ date: key, slots: byDate.get(key) ?? [] });
      seen.add(key);
    }
  }

  for (const [date, slots] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (seen.has(date)) continue;
    days.push({ date, slots });
  }

  return { recommended, days, searchedDays: daysScanned, workersConsidered };
}
