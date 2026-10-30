import holiday_jp from "@holiday-jp/holiday_jp";
import type { AppSettings } from "./settings-shared";
import { workdayKeyFromDate } from "./settings-shared";
import { jstDateKey, jstParts, jstWallTimeToDate } from "./time/jst";

/** YYYY-MM-DD（Asia/Tokyo） */
export function toDateKey(d: Date): string {
  return jstDateKey(d);
}

export function isNationalHoliday(d: Date): boolean {
  try {
    // holiday_jp はローカル日付成分を見るため、JST の年月日で正午を渡す
    const p = jstParts(d);
    return holiday_jp.isHoliday(jstWallTimeToDate(p.year, p.month, p.day, 12, 0, 0));
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
