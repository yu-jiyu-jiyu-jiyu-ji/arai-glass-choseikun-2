import { APP_CONFIG } from "../config";
import { getDriveMinutes, TravelTimeCache } from "../gap-search/travel";
import { addJstDays, startOfJstDay } from "../time/jst";
import type { CalendarEvent, LatLng, Worker } from "../types";
import { fetchWorkerEvents } from "../google/calendar";
import { fetchDriveMinutes, geocodeAddress, mapsConfigured } from "../google/maps";
import { oauthConfigured } from "../google/oauth";
import { buildMockEvents, mockGeocode } from "./mock";
import { getWorkerRefreshToken } from "./oauth-tokens";

export async function resolveCustomerLatLng(address: string): Promise<LatLng> {
  if (APP_CONFIG.useMockProviders || !mapsConfigured()) {
    return mockGeocode(address);
  }
  return geocodeAddress(address);
}

export function createDriveFetcher():
  | ((from: LatLng, to: LatLng) => Promise<number>)
  | undefined {
  if (APP_CONFIG.useMockProviders || !mapsConfigured()) return undefined;
  return (from, to) => fetchDriveMinutes(from, to);
}

/**
 * 職人ごとのカレンダー予定。
 * モック時は buildMockEvents。
 * 本番は OAuth 済み職人のみ実カレンダーを読む（未連携は空＝全日空き扱い）。
 */
export async function loadEventsByWorker(
  workers: Worker[],
  fromDate: Date,
  maxSearchDays: number,
): Promise<Map<string, CalendarEvent[]>> {
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) {
    return buildMockEvents();
  }

  const timeMin = startOfJstDay(fromDate);
  const timeMax = addJstDays(timeMin, maxSearchDays + 2);

  const map = new Map<string, CalendarEvent[]>();
  await Promise.all(
    workers.map(async (w) => {
      const refresh = await getWorkerRefreshToken(w.id);
      if (!refresh) {
        map.set(w.id, []);
        console.warn(`[live] worker ${w.id} has no refresh_token — empty calendar`);
        return;
      }
      try {
        const events = await fetchWorkerEvents({
          worker: w,
          refreshToken: refresh,
          timeMin,
          timeMax,
        });
        map.set(w.id, events);
      } catch (e) {
        console.error(`[live] calendar fetch failed for ${w.id}`, e);
        map.set(w.id, []);
      }
    }),
  );
  return map;
}

export async function driveMinutesWithCache(
  a: LatLng,
  b: LatLng,
  cache: TravelTimeCache,
): Promise<number> {
  return getDriveMinutes(a, b, cache, createDriveFetcher());
}
