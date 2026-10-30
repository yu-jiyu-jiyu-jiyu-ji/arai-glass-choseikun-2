/** 業務時刻はすべて Asia/Tokyo 基準（Render の UTC ホストでもずれない） */

export const JST = "Asia/Tokyo";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** JST の年月日・時分・曜日（0=日 … 6=土） */
export function jstParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

/** YYYY-MM-DD（JST） */
export function jstDateKey(d: Date): string {
  const p = jstParts(d);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** JST 壁時計 → UTC Date */
export function jstWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+09:00`,
  );
}

export function startOfJstDay(d: Date): Date {
  const p = jstParts(d);
  return jstWallTimeToDate(p.year, p.month, p.day, 0, 0, 0);
}

export function addJstDays(d: Date, n: number): Date {
  const p = jstParts(d);
  // 正午 JST を基準に日加算（DST なしなので安全）
  const noon = jstWallTimeToDate(p.year, p.month, p.day, 12, 0, 0);
  noon.setTime(noon.getTime() + n * 24 * 60 * 60 * 1000);
  return startOfJstDay(noon);
}

export function jstWallOnSameDay(
  day: Date,
  hour: number,
  minute = 0,
): Date {
  const p = jstParts(day);
  return jstWallTimeToDate(p.year, p.month, p.day, hour, minute, 0);
}
