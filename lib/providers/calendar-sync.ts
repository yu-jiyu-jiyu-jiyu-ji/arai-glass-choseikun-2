import { APP_CONFIG } from "../config";
import {
  CHOSEIKUN_SITE_MARK,
  CHOSEIKUN_TRAVEL_MARK,
  deleteCalendarEvent,
  insertCalendarEvent,
  listManagedCalendarEvents,
  type ManagedCalendarEvent,
} from "../google/calendar";
import { fetchDriveMinutes, geocodeAddress, mapsConfigured } from "../google/maps";
import { oauthConfigured } from "../google/oauth";
import { loadSettings } from "../settings";
import { addJstDays, jstWallOnSameDay, startOfJstDay } from "../time/jst";
import type { Booking, LatLng, Parking } from "../types";
import { getWorkerRefreshToken } from "./oauth-tokens";

const PARKING_LABEL: Record<Parking, string> = {
  onsite: "敷地内あり",
  coin: "近隣コインパーキングあり",
  front: "家の前・私道に駐車可",
  none: "なし",
};

function toIso(d: Date) {
  return d.toISOString();
}

function siteEvents(events: ManagedCalendarEvent[]) {
  return events.filter((e) => e.kind === "site" && e.location);
}

/**
 * 担当職人のカレンダーへ「現地＋車移動」を登録し、間に挟む場合は既存の調整くん移動を付け替える。
 * - 前の現地なし → 事務所起点の移動
 * - 後の現地なし → 事務所への帰社移動
 * - 車移動のみ（Maps の DRIVE）
 */
export async function pushBookingToCalendars(
  booking: Booking,
): Promise<Record<string, string[]>> {
  const ids: Record<string, string[]> = {};
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return ids;

  const settings = await loadSettings();
  const office = settings.officeLatLng;
  const officeLabel = [settings.officeAddress, settings.officeBuilding].filter(Boolean).join(" ");

  let customerLatLng: LatLng;
  try {
    customerLatLng = mapsConfigured()
      ? await geocodeAddress(booking.address)
      : office;
  } catch (e) {
    console.error("[calendar-sync] geocode customer failed", e);
    customerLatLng = office;
  }

  const bookingStart = new Date(booking.start);
  const bookingEnd = new Date(booking.end);
  const dayStart = startOfJstDay(bookingStart);
  const dayEnd = addJstDays(dayStart, 1);

  await Promise.all(
    booking.workerIds.map(async (workerId) => {
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip write`);
        return;
      }

      const created: string[] = [];
      try {
        const existing = await listManagedCalendarEvents({
          refreshToken: refresh,
          timeMin: dayStart,
          timeMax: dayEnd,
        });

        // この予約の現地枠と重ならない前後の現地
        const sites = siteEvents(existing).filter(
          (e) => !(e.start < bookingEnd && bookingStart < e.end),
        );
        const prevSite = [...sites]
          .filter((e) => e.end <= bookingStart)
          .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
        const nextSite = [...sites]
          .filter((e) => e.start >= bookingEnd)
          .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

        const anchorA = {
          at: prevSite?.end ?? jstWallOnSameDay(bookingStart, settings.workdayStartHour, 0),
          latLng: prevSite ? await geocodeSafe(prevSite.location!, office) : office,
          label: prevSite?.location ?? officeLabel,
        };
        const anchorB = {
          at: nextSite?.start ?? jstWallOnSameDay(bookingEnd, settings.workdayEndHour, 0),
          latLng: nextSite ? await geocodeSafe(nextSite.location!, office) : office,
          label: nextSite?.location ?? officeLabel,
          isOffice: !nextSite,
        };

        // 付け替え: 直前〜直後のあいだにある「調整くん移動」を削除
        // （例: 事務所→葛西 の移動を消して、事務所→浅草橋・浅草橋→葛西 に差し替える）
        const gapStart = anchorA.at;
        const gapEnd = nextSite?.start ?? bookingEnd;
        const toDelete = existing.filter(
          (e) =>
            e.choseikunManaged &&
            e.choseikunKind === "travel" &&
            e.start < gapEnd &&
            gapStart < e.end,
        );
        for (const ev of toDelete) {
          try {
            await deleteCalendarEvent(refresh, ev.id);
          } catch (e) {
            console.warn(`[calendar-sync] delete old travel ${ev.id}`, e);
          }
        }

        // もし直後が事務所帰社で、直後現地がない場合、booking 後〜就業終了の旧帰社移動も消す
        if (!nextSite) {
          const returnDeletes = existing.filter(
            (e) =>
              e.choseikunManaged &&
              e.choseikunKind === "travel" &&
              e.start >= bookingStart &&
              e.start < jstWallOnSameDay(bookingEnd, settings.workdayEndHour, 0),
          );
          for (const ev of returnDeletes) {
            if (toDelete.some((d) => d.id === ev.id)) continue;
            try {
              await deleteCalendarEvent(refresh, ev.id);
            } catch (e) {
              console.warn(`[calendar-sync] delete old return travel ${ev.id}`, e);
            }
          }
        }

        const travelInMin = await driveMinutesSafe(anchorA.latLng, customerLatLng);
        const travelOutMin = await driveMinutesSafe(customerLatLng, anchorB.latLng);

        // 到着移動: 終わる時刻 = 調査開始。開始は Maps 分だけ前（直前予定より後にクランプ）
        const travelInEnd = bookingStart;
        let travelInStart = new Date(travelInEnd.getTime() - travelInMin * 60_000);
        if (travelInStart < anchorA.at) travelInStart = new Date(anchorA.at);

        if (travelInEnd > travelInStart) {
          const id = await insertCalendarEvent(refresh, {
            summary: "移動（車）",
            location: "",
            description: [
              `${anchorA.label} → ${booking.address}`,
              `予約ID: ${booking.id}`,
              "",
              CHOSEIKUN_TRAVEL_MARK,
            ].join("\n"),
            startIso: toIso(travelInStart),
            endIso: toIso(travelInEnd),
            kind: "travel",
            bookingId: booking.id,
          });
          created.push(id);
        }

        // 現地調査
        const siteId = await insertCalendarEvent(refresh, {
          summary: `現地調査 ${booking.name}様`,
          location: booking.address,
          description: [
            `お客様: ${booking.name}`,
            `電話: ${booking.phone}`,
            `メール: ${booking.email}`,
            `住所: ${booking.address}`,
            `駐車場: ${PARKING_LABEL[booking.parking] ?? booking.parking}`,
            `予約ID: ${booking.id}`,
            "",
            CHOSEIKUN_SITE_MARK,
          ].join("\n"),
          startIso: booking.start,
          endIso: booking.end,
          kind: "site",
          bookingId: booking.id,
        });
        created.push(siteId);

        // 出発移動: 調査終了 → 次現地 or 事務所
        const travelOutStart = bookingEnd;
        let travelOutEnd = new Date(travelOutStart.getTime() + travelOutMin * 60_000);
        if (travelOutEnd > anchorB.at) travelOutEnd = new Date(anchorB.at);

        if (travelOutEnd > travelOutStart) {
          const id = await insertCalendarEvent(refresh, {
            summary: "移動（車）",
            location: "",
            description: [
              `${booking.address} → ${anchorB.label}`,
              anchorB.isOffice ? "（帰社）" : "",
              `予約ID: ${booking.id}`,
              "",
              CHOSEIKUN_TRAVEL_MARK,
            ]
              .filter(Boolean)
              .join("\n"),
            startIso: toIso(travelOutStart),
            endIso: toIso(travelOutEnd),
            kind: "travel",
            bookingId: booking.id,
          });
          created.push(id);
        }

        ids[workerId] = created;
      } catch (e) {
        console.error(`[calendar-sync] sync failed for ${workerId}`, e);
        if (created.length) ids[workerId] = created;
      }
    }),
  );

  return ids;
}

async function geocodeSafe(address: string, fallback: LatLng): Promise<LatLng> {
  if (!mapsConfigured() || !address.trim()) return fallback;
  try {
    return await geocodeAddress(address);
  } catch {
    return fallback;
  }
}

async function driveMinutesSafe(from: LatLng, to: LatLng): Promise<number> {
  if (!mapsConfigured()) {
    const { estimateDriveMinutes } = await import("../gap-search/travel");
    return estimateDriveMinutes(from, to);
  }
  try {
    return await fetchDriveMinutes(from, to);
  } catch {
    const { estimateDriveMinutes } = await import("../gap-search/travel");
    return estimateDriveMinutes(from, to);
  }
}

/** キャンセル時に登録済みイベント（現地＋移動）を削除 */
export async function removeBookingFromCalendars(booking: Booking): Promise<void> {
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return;
  const map = booking.calendarEventIds ?? {};
  await Promise.all(
    Object.entries(map).map(async ([workerId, raw]) => {
      const eventIds = normalizeEventIds(raw);
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip delete`);
        return;
      }
      for (const eventId of eventIds) {
        try {
          await deleteCalendarEvent(refresh, eventId);
        } catch (e) {
          console.error(`[calendar-sync] delete failed for ${workerId}/${eventId}`, e);
        }
      }
    }),
  );
}

/** 旧形式（string）と新形式（string[]）両対応 */
export function normalizeEventIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw ? [raw] : [];
}
