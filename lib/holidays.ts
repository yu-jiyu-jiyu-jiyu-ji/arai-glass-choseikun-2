import holiday_jp from "@holiday-jp/holiday_jp";
import type { AppSettings } from "./settings-shared";
import { workdayKeyFromDate } from "./settings-shared";

/** YYYY-MM-DD（ローカル日付） */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isNationalHoliday(d: Date): boolean {
  try {
    return holiday_jp.isHoliday(d);
  } catch {
    return false;
  }
}

/**
 * 候補検索の対象日か。
 * 定休曜日・個別休日・（設定時）祝日を除外する。
 */
export function isSearchableDay(d: Date, settings: AppSettings): boolean {
  if (!settings.workdays[workdayKeyFromDate(d)]) return false;
  const key = toDateKey(d);
  if ((settings.individualHolidays ?? []).includes(key)) return false;
  if (settings.excludeNationalHolidays && isNationalHoliday(d)) return false;
  return true;
}
