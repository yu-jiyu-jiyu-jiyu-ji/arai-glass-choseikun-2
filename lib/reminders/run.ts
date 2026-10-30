import { jstDateKey, jstParts, addJstDays, startOfJstDay } from "../time/jst";
import { sendMail, smtpConfigured } from "../mail/smtp";
import { loadSettings } from "../settings";
import { loadBookings, markBookingReminderSent } from "../store";
import type { Booking } from "../types";

function formatVisit(iso: string): string {
  const d = new Date(iso);
  const p = jstParts(d);
  const week = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}年${p.month}月${p.day}日（${week[p.weekday]}） ${pad(p.hour)}:${pad(p.minute)}`;
}

function buildMail(booking: Booking, daysBefore: number): { subject: string; text: string } {
  const when =
    daysBefore === 1 ? "明日" : daysBefore === 7 ? "1週間後" : `${daysBefore}日後`;
  const subject = `【リマインド】現地調査のご案内（${when}）／荒井硝子`;
  const text = [
    `${booking.name} 様`,
    "",
    `現地調査の日程が${when}に近づいてまいりましたので、ご連絡いたします。`,
    "",
    `■ 日時: ${formatVisit(booking.start)}`,
    `■ ご住所: ${booking.address}`,
    "",
    "ご不明点がございましたら、本メールにご返信いただくかお電話にてご連絡ください。",
    "",
    "荒井硝子",
  ].join("\n");
  return { subject, text };
}

export type ReminderRunResult = {
  ok: boolean;
  skipped?: string;
  hourJst?: number;
  reminderHour?: number;
  smtpConfigured: boolean;
  checked: number;
  sent: { bookingId: string; daysBefore: number; to: string }[];
  errors: { bookingId: string; daysBefore: number; error: string }[];
};

/**
 * 設定の reminderHour（JST）に一致するとき、
 * reminderDaysBefore 日前の予約へメールを送る。
 */
export async function runReminders(opts?: {
  /** true なら時刻チェックをスキップ（手動テスト用） */
  force?: boolean;
  now?: Date;
}): Promise<ReminderRunResult> {
  const now = opts?.now ?? new Date();
  const settings = await loadSettings();
  const parts = jstParts(now);
  const result: ReminderRunResult = {
    ok: true,
    smtpConfigured: smtpConfigured(),
    hourJst: parts.hour,
    reminderHour: settings.reminderHour,
    checked: 0,
    sent: [],
    errors: [],
  };

  if (!settings.reminderEnabled) {
    result.skipped = "reminderEnabled=false";
    return result;
  }
  if (!opts?.force && parts.hour !== settings.reminderHour) {
    result.skipped = `not reminder hour (now ${parts.hour}, want ${settings.reminderHour})`;
    return result;
  }
  if (!smtpConfigured()) {
    result.ok = false;
    result.skipped = "SMTP not configured";
    return result;
  }

  const offsets = (settings.reminderDaysBefore ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (offsets.length === 0) {
    result.skipped = "reminderDaysBefore empty";
    return result;
  }

  const today = startOfJstDay(now);
  const bookings = (await loadBookings()).filter((b) => b.status === "confirmed");
  result.checked = bookings.length;

  for (const daysBefore of offsets) {
    const targetKey = jstDateKey(addJstDays(today, daysBefore));
    const key = String(daysBefore);

    for (const booking of bookings) {
      if (jstDateKey(new Date(booking.start)) !== targetKey) continue;
      if (booking.remindersSent?.[key]) continue;
      if (!booking.email?.trim()) {
        result.errors.push({
          bookingId: booking.id,
          daysBefore,
          error: "email empty",
        });
        continue;
      }

      try {
        const mail = buildMail(booking, daysBefore);
        await sendMail({ to: booking.email.trim(), subject: mail.subject, text: mail.text });
        await markBookingReminderSent(booking.id, key);
        result.sent.push({
          bookingId: booking.id,
          daysBefore,
          to: booking.email.trim(),
        });
      } catch (e) {
        result.errors.push({
          bookingId: booking.id,
          daysBefore,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (result.errors.length && !result.sent.length) result.ok = false;
  return result;
}
