import { APP_CONFIG } from "../config";
import { deleteCalendarEvent, insertCalendarEvent } from "../google/calendar";
import { oauthConfigured } from "../google/oauth";
import type { Booking, Parking } from "../types";
import { getWorkerRefreshToken } from "./oauth-tokens";

const PARKING_LABEL: Record<Parking, string> = {
  onsite: "敷地内あり",
  coin: "近隣コインパーキングあり",
  front: "家の前・私道に駐車可",
  none: "なし",
};

function eventPayload(booking: Booking) {
  return {
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
      "※調整くんからの自動登録",
    ].join("\n"),
    startIso: booking.start,
    endIso: booking.end,
  };
}

/**
 * 担当職人それぞれの Google カレンダーへ予定を登録。
 * モック時・OAuth未設定時は何もしない。
 * 失敗しても予約自体は成功扱い（呼び出し側でログ）。
 */
export async function pushBookingToCalendars(
  booking: Booking,
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return ids;

  await Promise.all(
    booking.workerIds.map(async (workerId) => {
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip write`);
        return;
      }
      try {
        const eventId = await insertCalendarEvent(refresh, eventPayload(booking));
        ids[workerId] = eventId;
      } catch (e) {
        console.error(`[calendar-sync] insert failed for ${workerId}`, e);
      }
    }),
  );
  return ids;
}

/** キャンセル時に登録済みイベントを削除 */
export async function removeBookingFromCalendars(booking: Booking): Promise<void> {
  if (APP_CONFIG.useMockProviders || !oauthConfigured()) return;
  const map = booking.calendarEventIds ?? {};
  await Promise.all(
    Object.entries(map).map(async ([workerId, eventId]) => {
      const refresh = await getWorkerRefreshToken(workerId);
      if (!refresh) {
        console.warn(`[calendar-sync] no refresh_token for ${workerId}, skip delete`);
        return;
      }
      try {
        await deleteCalendarEvent(refresh, eventId);
      } catch (e) {
        console.error(`[calendar-sync] delete failed for ${workerId}`, e);
      }
    }),
  );
}
