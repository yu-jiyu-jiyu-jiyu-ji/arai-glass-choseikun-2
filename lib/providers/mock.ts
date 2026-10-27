import { DEFAULT_SETTINGS } from "../settings-shared";
import type { CalendarEvent, LatLng, Worker } from "../types";

/** デモ用職人（10人想定のうち一部）。本番は Firestore workers */
export const MOCK_WORKERS: Worker[] = [
  {
    id: "w1",
    name: "調査メインA",
    googleEmail: "survey-a@example.com",
    oauthLinked: true,
    surveyMain: true,
    rank: "A",
    calendarId: "cal-w1",
    active: true,
  },
  {
    id: "w2",
    name: "調査メインB",
    googleEmail: "survey-b@example.com",
    oauthLinked: true,
    surveyMain: true,
    rank: "A",
    calendarId: "cal-w2",
    active: true,
  },
  {
    id: "w3",
    name: "近くの職人C",
    googleEmail: "worker-c@example.com",
    oauthLinked: true,
    surveyMain: false,
    rank: "B",
    calendarId: "cal-w3",
    active: true,
  },
  {
    id: "w4",
    name: "近くの職人D",
    googleEmail: "worker-d@example.com",
    oauthLinked: false,
    surveyMain: false,
    rank: "B",
    calendarId: "cal-w4",
    active: true,
  },
  {
    id: "w5",
    name: "職人E",
    googleEmail: "worker-e@example.com",
    oauthLinked: false,
    surveyMain: false,
    rank: "C",
    calendarId: "cal-w5",
    active: true,
  },
];

const AREAS: Record<string, LatLng> = {
  suginami: { lat: 35.7046, lng: 139.6355 },
  setagaya: { lat: 35.6467, lng: 139.6532 },
  nerima: { lat: 35.7356, lng: 139.6517 },
  shibuya: { lat: 35.6595, lng: 139.7005 },
  hachioji: { lat: 35.6556, lng: 139.3389 },
};

function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * モック予定:
 * - w1/w2（調査メイン）は直近が埋まっており「来週」寄り
 * - w3（近く）は3日後付近が空く → 最短候補になりやすい
 * - 「移動」は busy（地点なし）
 */
export function buildMockEvents(): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();

  const w1: CalendarEvent[] = [];
  const w2: CalendarEvent[] = [];
  const w3: CalendarEvent[] = [];
  const w4: CalendarEvent[] = [];
  const w5: CalendarEvent[] = [];

  // 調査メイン: 直近5日は現地予定で埋める
  for (let d = 0; d <= 5; d++) {
    if (at(d, 0).getDay() === 0) continue;
    w1.push({
      id: `w1-site-${d}`,
      workerId: "w1",
      kind: "site",
      title: "訪問調査",
      start: at(d, 10),
      end: at(d, 11),
      location: "東京都世田谷区",
      latLng: AREAS.setagaya,
    });
    w1.push({
      id: `w1-busy-${d}`,
      workerId: "w1",
      kind: "busy",
      title: "移動",
      start: at(d, 11),
      end: at(d, 12),
      location: null,
      latLng: null,
    });
    w1.push({
      id: `w1-site2-${d}`,
      workerId: "w1",
      kind: "site",
      title: "訪問調査",
      start: at(d, 14),
      end: at(d, 15),
      location: "東京都渋谷区",
      latLng: AREAS.shibuya,
    });

    w2.push({
      id: `w2-site-${d}`,
      workerId: "w2",
      kind: "site",
      title: "訪問調査",
      start: at(d, 9),
      end: at(d, 10),
      location: "東京都練馬区",
      latLng: AREAS.nerima,
    });
    w2.push({
      id: `w2-site2-${d}`,
      workerId: "w2",
      kind: "site",
      title: "訪問調査",
      start: at(d, 13),
      end: at(d, 16),
      location: "東京都八王子市",
      latLng: AREAS.hachioji,
    });
  }

  for (let d = 0; d <= 2; d++) {
    if (at(d, 0).getDay() === 0) continue;
    for (const [wid, arr] of [
      ["w3", w3],
      ["w4", w4],
    ] as const) {
      arr.push({
        id: `${wid}-busy-${d}`,
        workerId: wid,
        kind: "site",
        title: "訪問調査",
        start: at(d, 9),
        end: at(d, 17),
        location: "東京都杉並区",
        latLng: AREAS.suginami,
      });
    }
  }
  for (let d = 3; d <= 10; d++) {
    if (at(d, 0).getDay() === 0) continue;
    for (const [wid, arr] of [
      ["w3", w3],
      ["w4", w4],
    ] as const) {
      arr.push({
        id: `${wid}-am-${d}`,
        workerId: wid,
        kind: "site",
        title: "訪問調査",
        start: at(d, 9),
        end: at(d, 10, 30),
        location: "東京都杉並区阿佐谷",
        latLng: AREAS.suginami,
      });
    }
  }

  for (let d = 1; d <= 8; d += 2) {
    if (at(d, 0).getDay() === 0) continue;
    w5.push({
      id: `w5-${d}`,
      workerId: "w5",
      kind: "busy",
      title: "移動",
      start: at(d, 13),
      end: at(d, 14),
      location: null,
      latLng: null,
    });
  }

  map.set("w1", w1);
  map.set("w2", w2);
  map.set("w3", w3);
  map.set("w4", w4);
  map.set("w5", w5);
  return map;
}

/** デモ用: 住所文字列からおおまかな座標（本番は Geocoding API） */
export function mockGeocode(address: string): LatLng {
  if (address.includes("八王子")) return AREAS.hachioji;
  if (address.includes("世田谷")) return AREAS.setagaya;
  if (address.includes("練馬")) return AREAS.nerima;
  if (address.includes("渋谷")) return AREAS.shibuya;
  if (address.includes("杉並") || address.includes("阿佐谷")) return AREAS.suginami;
  return {
    lat: DEFAULT_SETTINGS.officeLatLng.lat + 0.01,
    lng: DEFAULT_SETTINGS.officeLatLng.lng + 0.01,
  };
}

/** 丁目・番地っぽい文字があるか（簡易） */
export function hasDetailedAddress(address: string): boolean {
  const t = address.replace(/\s/g, "");
  return /\d|[０-９]/.test(t) && t.length >= 8;
}
