import { APP_CONFIG } from "../config";
import {
  CHOSEIKUN_SITE_MARK,
  deleteCalendarEvent,
  insertCalendarEvent,
  listManagedCalendarEvents,
  patchCalendarEvent,
} from "../google/calendar";
import { oauthConfigured } from "../google/oauth";
import { loadSettings } from "../settings";
import { addJstDays, startOfJstDay } from "../time/jst";
import type { Booking, Parking } from "../types";
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

function mapsDirUrl(origin: string, destination: string) {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&travelmode=driving`
  );
}

/**
 * 担当職人のカレンダーへ「現地調査」のみ登録。
 * - 長さ = 調査時間 + 調査後バッファ（共通設定）
 * - 移動（車）はカレンダーに書かない（空き判定の計算のみ）
 * - ナビURLは現地の説明に付与（事務所→お客様）
 * - 旧仕様の調整くん移動が残っていれば同日分を掃除
 */
export async function pushBookingToCalendars(
  booking: Booking,
): Promise<Record<string, string[]>> {
  const ids: Record<string, string[]> = {};
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return ids;

  const settings = await loadSettings();
  const officeLabel = [settings.officeAddress, settings.officeBuilding].filter(Boolean).join(" ");
  const postBuffer = settings.bufferMinutes ?? 0;
  const bookingStart = new Date(booking.start);
  const bookingEnd = new Date(booking.end);
  const siteEnd = new Date(bookingEnd.getTime() + postBuffer * 60_000);
  const dayStart = startOfJstDay(bookingStart);
  const dayEnd = addJstDays(dayStart, 1);

  const navUrl = mapsDirUrl(officeLabel || "事務所", booking.address);

  await Promise.all(
    booking.workerIds.map(async (workerId) => {
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip write`);
        return;
      }

      const created: string[] = [];
      try {
        // 旧・移動予定の掃除（方針変更後は新規作成しない）
        try {
          const existing = await listManagedCalendarEvents({
            refreshToken: refresh,
            timeMin: dayStart,
            timeMax: dayEnd,
          });
          for (const ev of existing) {
            const isTravel =
              ev.choseikunKind === "travel" ||
              (ev.choseikunManaged && ev.summary.includes("移動"));
            if (!isTravel) continue;
            try {
              await deleteCalendarEvent(refresh, ev.id);
            } catch (e) {
              console.warn(`[calendar-sync] delete old travel ${ev.id}`, e);
            }
          }
        } catch (e) {
          console.warn(`[calendar-sync] list for travel cleanup failed ${workerId}`, e);
        }

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
            `現地枠: 調査${settings.surveyMinutes}分 + 調査後バッファ${postBuffer}分`,
            "",
            "【ナビ（車・事務所起点）】",
            navUrl,
            "",
            CHOSEIKUN_SITE_MARK,
          ].join("\n"),
          startIso: toIso(bookingStart),
          endIso: toIso(siteEnd),
          kind: "site",
          bookingId: booking.id,
        });
        created.push(siteId);
        ids[workerId] = created;
      } catch (e) {
        console.error(`[calendar-sync] sync failed for ${workerId}`, e);
        if (created.length) ids[workerId] = created;
      }
    }),
  );

  return ids;
}

/**
 * キャンセル時のカレンダー清掃:
 * - 現地予定: タイトル先頭に【キャンセル】を付与（空き枠として再利用可）
 * - 移動予定（旧データ）: 削除
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
      let managed: Awaited<ReturnType<typeof listManagedCalendarEvents>> = [];
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
          if (isTravel) {
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
