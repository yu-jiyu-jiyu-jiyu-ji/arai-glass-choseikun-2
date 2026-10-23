export type WorkdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type LatLng = { lat: number; lng: number };

export type AppSettings = {
  officeAddress: string;
  officePostalCode: string;
  officeBuilding: string;
  officeLatLng: LatLng;
  workdays: Record<WorkdayKey, boolean>;
  workdayStartHour: number;
  workdayEndHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
  surveyMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  detourThresholdMinutes: number;
  initialSearchDays: number;
  extendSearchDays: number;
  maxSearchDays: number;
  recommendedCount: number;
  requireTwoWorkers: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  officeAddress: "東京都杉並区阿佐谷北３丁目４３−１１",
  officePostalCode: "166-0001",
  officeBuilding: "AGビル 1F",
  officeLatLng: { lat: 35.7048, lng: 139.6362 },
  workdays: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: true,
    sun: false,
  },
  workdayStartHour: 9,
  workdayEndHour: 17,
  lunchStartHour: 12,
  lunchEndHour: 13,
  surveyMinutes: 45,
  bufferMinutes: 15,
  slotIntervalMinutes: 60,
  detourThresholdMinutes: 20,
  initialSearchDays: 7,
  extendSearchDays: 7,
  maxSearchDays: 21,
  recommendedCount: 3,
  requireTwoWorkers: true,
};

export const WORKDAY_LABELS: { key: WorkdayKey; label: string }[] = [
  { key: "mon", label: "月" },
  { key: "tue", label: "火" },
  { key: "wed", label: "水" },
  { key: "thu", label: "木" },
  { key: "fri", label: "金" },
  { key: "sat", label: "土" },
  { key: "sun", label: "日" },
];

export function workdayKeyFromDate(d: Date): WorkdayKey {
  const map: WorkdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

export function officeFullAddress(s: AppSettings): string {
  const zip = s.officePostalCode ? `〒${s.officePostalCode} ` : "";
  const bld = s.officeBuilding ? ` ${s.officeBuilding}` : "";
  return `${zip}${s.officeAddress}${bld}`.trim();
}
