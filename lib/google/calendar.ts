import type { CalendarEvent, LatLng, Worker } from "../types";
import { refreshAccessToken } from "./oauth";
import { geocodeAddress, mapsConfigured } from "./maps";

type RawEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export const CHOSEIKUN_TRAVEL_MARK = "※調整くん移動";
export const CHOSEIKUN_SITE_MARK = "※調整くんからの自動登録";

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

export type CalendarWriteInput = {
  summary: string;
  description: string;
  location?: string;
  startIso: string;
  endIso: string;
  /** site | travel */
  kind?: "site" | "travel";
  bookingId?: string;
};

/** primary カレンダーへ予定を作成。作成した event id を返す */
export async function insertCalendarEvent(
  refreshToken: string,
  input: CalendarWriteInput,
): Promise<string> {
  const { accessToken } = await refreshAccessToken(refreshToken);
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const kind = input.kind ?? "site";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      location: input.location ?? "",
      // start/end は予約APIの ISO（オフセット付き）をそのまま使う
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
      extendedProperties: {
        private: {
          choseikun: "1",
          kind,
          ...(input.bookingId ? { bookingId: input.bookingId } : {}),
        },
      },
    }),
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || `Calendar insert ${res.status}`);
  }
  return data.id;
}

export type ManagedCalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location: string | null;
  start: Date;
  end: Date;
  kind: "site" | "busy";
  choseikunManaged: boolean;
  choseikunKind: "site" | "travel" | null;
};

/** 期間内の予定（付け替え判定用。調整くん管理フラグ付き） */
export async function listManagedCalendarEvents(opts: {
  refreshToken: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<ManagedCalendarEvent[]> {
  const { accessToken } = await refreshAccessToken(opts.refreshToken);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", opts.timeMin.toISOString());
  url.searchParams.set("timeMax", opts.timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { items?: RawEvent[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar API ${res.status}`);
  }

  const out: ManagedCalendarEvent[] = [];
  for (const item of data.items ?? []) {
    if (item.status === "cancelled") continue;
    const start = parseEventTime(item.start, false);
    const end = parseEventTime(item.end, true);
    if (!start || !end || !(end > start)) continue;
    const location = item.location?.trim() ? item.location.trim() : null;
    const title = item.summary?.trim() || "(無題)";
    const description = item.description ?? "";
    const priv = item.extendedProperties?.private ?? {};
    const choseikunManaged =
      priv.choseikun === "1" ||
      description.includes(CHOSEIKUN_TRAVEL_MARK) ||
      description.includes(CHOSEIKUN_SITE_MARK);
    const choseikunKind: "site" | "travel" | null =
      priv.kind === "travel" || description.includes(CHOSEIKUN_TRAVEL_MARK)
        ? "travel"
        : priv.kind === "site" || description.includes(CHOSEIKUN_SITE_MARK)
          ? "site"
          : null;
    out.push({
      id: item.id || `${start.toISOString()}`,
      summary: title,
      description,
      location,
      start,
      end,
      kind: classifyEvent(title, location),
      choseikunManaged,
      choseikunKind,
    });
  }
  return out;
}

export async function deleteCalendarEvent(
  refreshToken: string,
  eventId: string,
): Promise<void> {
  const { accessToken } = await refreshAccessToken(refreshToken);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404 = 既に消えている → 成功扱い
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Calendar delete ${res.status}: ${text.slice(0, 200)}`);
  }
}
