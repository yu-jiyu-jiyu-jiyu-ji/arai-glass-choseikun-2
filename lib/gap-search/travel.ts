import type { LatLng } from "../types";

/** 地点ペアの移動時間キャッシュ（分） */
export class TravelTimeCache {
  private cache = new Map<string, number>();

  private key(a: LatLng, b: LatLng) {
    return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  }

  get(a: LatLng, b: LatLng): number | undefined {
    return this.cache.get(this.key(a, b));
  }

  set(a: LatLng, b: LatLng, minutes: number) {
    this.cache.set(this.key(a, b), minutes);
  }
}

/**
 * 簡易ハバーサイン距離から車移動分を概算（モック / フォールバック用）。
 * 本番は Distance Matrix API に差し替える。
 */
export function estimateDriveMinutes(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  // 都市部: 平均 20km/h 相当 + 最低8分
  return Math.max(8, Math.round((km / 20) * 60));
}

export async function getDriveMinutes(
  a: LatLng,
  b: LatLng,
  cache: TravelTimeCache,
  fetcher?: (from: LatLng, to: LatLng) => Promise<number>,
): Promise<number> {
  const hit = cache.get(a, b);
  if (hit !== undefined) return hit;
  const minutes = fetcher ? await fetcher(a, b) : estimateDriveMinutes(a, b);
  cache.set(a, b, minutes);
  return minutes;
}
