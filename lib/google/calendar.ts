import type { CalendarEvent, LatLng, Worker } from "../types";
import { refreshAccessToken } from "./oauth";
import { geocodeAddress, mapsConfigured } from "./maps";

type RawEvent = {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function parseEventTime(raw?: { dateTime?: string; date?: string }, endOfDay = false): Date | null {
  if (!raw) return null;
  if (raw.dateTime) return new Date(raw.dateTime);
  if (raw.date) {
    // 終日: 開始 00:00 / 終了はその日の 24:00 相当（APIは翌日 date）
    const d = new Date(`${raw.date}T00:00:00+09:00`);
    if (endOfDay) {
      // Google の end.date は排他的翌日
      return d;
    }
    return d;
  }
  return null;
}

function classifyEvent(summary: string, location: string | null): "site" | "busy" {
  const title = summary || "";
  if (/移動|busy|ブロック/i.test(title) && !location) return "busy";
  if (location && location.trim()) return "site";
  return "busy";
}

const geocodeCache = new Map<string, LatLng | null>();

async function geocodeCached(address: string): Promise<LatLng | null> {
  const key = address.trim();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;
  if (!mapsConfigured()) {
    geocodeCache.set(key, null);
    return null;
  }
  try {
    const ll = await geocodeAddress(key);
    geocodeCache.set(key, ll);
    return ll;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

export async function listCalendarEvents(opts: {
  accessToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
  workerId: string;
}): Promise<CalendarEvent[]> {
  const calId = encodeURIComponent(opts.calendarId || "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`);
  url.searchParams.set("timeMin", opts.timeMin.toISOString());
  url.searchParams.set("timeMax", opts.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  const data = (await res.json()) as { items?: RawEvent[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar API ${res.status}`);
  }

  const out: CalendarEvent[] = [];
  for (const item of data.items ?? []) {
    // キャンセル・「予定なし」(transparent) は塞がない
    if (item.status === "cancelled") continue;
    if (item.transparency === "transparent") continue;

    const start = parseEventTime(item.start, false);
    const end = parseEventTime(item.end, true);
    if (!start || !end || !(end > start)) continue;
    const location = item.location?.trim() ? item.location.trim() : null;
    const title = item.summary?.trim() || "(無題)";
    // 住所なし・移動・ブロックも busy。現地（住所あり）は site
    const kind = classifyEvent(title, location);
    let latLng: LatLng | null = null;
    if (kind === "site" && location) {
      latLng = await geocodeCached(location);
      // 座標が取れない現地予定は Busy 扱いに落とす（地点A/Bに使わない）
      if (!latLng) {
        out.push({
          id: item.id || `${opts.workerId}-${start.toISOString()}`,
          workerId: opts.workerId,
          kind: "busy",
          title,
          start,
          end,
          location,
          latLng: null,
        });
        continue;
      }
    }
    out.push({
      id: item.id || `${opts.workerId}-${start.toISOString()}`,
      workerId: opts.workerId,
      kind,
      title,
      start,
      end,
      location,
      latLng,
    });
  }
  return out;
}

/** refresh_token から予定一覧を取得 */
export async function fetchWorkerEvents(opts: {
  worker: Worker;
  refreshToken: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<CalendarEvent[]> {
  const { accessToken } = await refreshAccessToken(opts.refreshToken);
  // OAuth したアカウントの主カレンダーを使う（台帳の calendarId/email だと別暦を読んで空き誤判定しやすい）
  const calendarId = "primary";
  return listCalendarEvents({
    accessToken,
    calendarId,
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    workerId: opts.worker.id,
  });
}
