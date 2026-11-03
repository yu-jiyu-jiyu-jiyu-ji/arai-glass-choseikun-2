import { APP_CONFIG } from "../config";
import {
  CHOSEIKUN_SITE_MARK,
  CHOSEIKUN_TRAVEL_MARK,
  deleteCalendarEvent,
  insertCalendarEvent,
  listManagedCalendarEvents,
  patchCalendarEvent,
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

function mapsDirUrl(origin: string, destination: string) {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&travelmode=driving`
  );
}

/**
 * 担当職人のカレンダーへ「現地＋車移動」を登録し、間に挟む場合は既存の調整くん移動を付け替える。
 * - 前の現地なし → 事務所起点の移動（就業開始前も可）
 * - 後の現地なし → 事務所への帰社移動（直後の他予定より前で打ち切り）
 * - ナビURLは移動予定に付与
 */
export async function pushBookingToCalendars(
  booking: Booking,
): Promise<Record<string, string[]>> {
  const ids: Record<string, string[]> = {};
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return ids;

  const settings = await loadSettings();
  const office = settings.officeLatLng;
  const officeLabel = [settings.officeAddress, settings.officeBuilding].filter(Boolean).join(" ");
  const travelBuffer = settings.travelBufferMinutes ?? 0;

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

        const sites = siteEvents(existing).filter(
          (e) => !(e.start < bookingEnd && bookingStart < e.end),
        );
        const prevSite = [...sites]
          .filter((e) => e.end <= bookingStart)
          .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
        const nextSite = [...sites]
          .filter((e) => e.start >= bookingEnd)
          .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

        // 直後の「他予定」（会議など）— 帰社移動が被らないよう締切にする
        const nextBusy = existing
          .filter(
            (e) =>
              e.start >= bookingEnd &&
              !(e.choseikunManaged && e.choseikunKind === "travel"),
          )
          .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

        const anchorA = {
          at: prevSite?.end ?? jstWallOnSameDay(bookingStart, settings.workdayStartHour, 0),
          latLng: prevSite ? await geocodeSafe(prevSite.location!, office) : office,
          label: prevSite?.location ?? officeLabel,
          fromSite: Boolean(prevSite),
        };
        const dayEndWall = jstWallOnSameDay(bookingEnd, settings.workdayEndHour, 0);
        const anchorB = {
          at: nextSite?.start ?? dayEndWall,
          latLng: nextSite ? await geocodeSafe(nextSite.location!, office) : office,
          label: nextSite?.location ?? officeLabel,
          isOffice: !nextSite,
        };

        const gapStart = prevSite?.end ?? dayStart;
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

        if (!nextSite) {
          const returnDeletes = existing.filter(
            (e) =>
              e.choseikunManaged &&
              e.choseikunKind === "travel" &&
              e.start >= bookingStart &&
              e.start < dayEndWall,
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
        const inDuration = travelInMin + travelBuffer;
        const outDuration = travelOutMin + travelBuffer;

        // 到着移動: 調査開始で終わる。事務所起点なら就業前スタート可
        const travelInEnd = bookingStart;
        let travelInStart = new Date(travelInEnd.getTime() - inDuration * 60_000);
        if (anchorA.fromSite && travelInStart < anchorA.at) {
          travelInStart = new Date(anchorA.at);
        }

        if (travelInEnd > travelInStart) {
          const id = await insertCalendarEvent(refresh, {
            summary: "移動（車）",
            location: "",
            description: [
              `${anchorA.label} → ${booking.address}`,
              "【ナビ（車）】",
              mapsDirUrl(anchorA.label, booking.address),
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

        // 現地調査（ナビは移動側に付ける）
        const siteId = await insertCalendarEvent(refresh, {
          summary: `現地調査 ${booking.name}様`,
          location: booking.address,
          description: [
            `お客様: ${booking.name}`,
            `電話: ${booking.phone}`,
            `メール: ${booking.email || "（未登録）"}`,
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

        // 出発移動: 次現地 or 帰社。直後の他予定より前で打ち切り（被り防止）
        const travelOutStart = bookingEnd;
        let travelOutEnd = new Date(travelOutStart.getTime() + outDuration * 60_000);
        const hardCap =
          nextBusy && nextBusy.start < anchorB.at ? nextBusy.start : anchorB.at;
        if (travelOutEnd > hardCap) travelOutEnd = new Date(hardCap);

        if (travelOutEnd > travelOutStart) {
          const id = await insertCalendarEvent(refresh, {
            summary: "移動（車）",
            location: "",
            description: [
              `${booking.address} → ${anchorB.label}`,
              anchorB.isOffice ? "（帰社）" : "",
              "【ナビ（車）】",
              mapsDirUrl(booking.address, anchorB.label),
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

/**
 * キャンセル時のカレンダー清掃:
 * - 現地予定: タイトル先頭に【キャンセル】を付与（空き枠として再利用可）
 * - 移動予定: 削除
 */
export async function removeBookingFromCalendars(booking: Booking): Promise<void> {
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return;
  const map = booking.calendarEventIds ?? {};
  await Promise.all(
    Object.entries(map).map(async ([workerId, raw]) => {
      const eventIds = normalizeEventIds(raw);
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip cancel clean`);
        return;
      }

      const dayStart = startOfJstDay(new Date(booking.start));
      const dayEnd = addJstDays(dayStart, 1);
      let managed: ManagedCalendarEvent[] = [];
      try {
        managed = await listManagedCalendarEvents({
          refreshToken: refresh,
          timeMin: dayStart,
          timeMax: dayEnd,
        });
      } catch (e) {
        console.warn(`[calendar-sync] list for cancel failed ${workerId}`, e);
      }

      for (const eventId of eventIds) {
        const hit = managed.find((m) => m.id === eventId);
        const isTravel =
          hit?.choseikunKind === "travel" || hit?.summary?.includes("移動") || false;
        try {
          if (isTravel || hit?.choseikunKind === "travel") {
            await deleteCalendarEvent(refresh, eventId);
          } else {
            const title = hit?.summary || `現地調査 ${booking.name}様`;
            const nextTitle = title.startsWith("【キャンセル】")
              ? title
              : `【キャンセル】${title}`;
            await patchCalendarEvent(refresh, eventId, { summary: nextTitle });
          }
        } catch (e) {
          console.error(`[calendar-sync] cancel clean failed ${workerId}/${eventId}`, e);
        }
      }

      for (const ev of managed) {
        if (ev.choseikunKind !== "travel") continue;
        if (!ev.description.includes(booking.id)) continue;
        if (eventIds.includes(ev.id)) continue;
        try {
          await deleteCalendarEvent(refresh, ev.id);
        } catch (e) {
          console.warn(`[calendar-sync] orphan travel delete ${ev.id}`, e);
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
