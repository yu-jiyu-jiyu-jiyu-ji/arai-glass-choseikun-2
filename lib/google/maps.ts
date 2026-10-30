import type { LatLng } from "../types";
import { estimateDriveMinutes } from "../gap-search/travel";

function mapsKey(): string {
  return (process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

export function mapsConfigured(): boolean {
  return Boolean(mapsKey());
}

/** 住所 → 座標（Geocoding API） */
export async function geocodeAddress(address: string): Promise<LatLng> {
  const key = mapsKey();
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY が未設定です");

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    results?: { geometry: { location: { lat: number; lng: number } } }[];
    error_message?: string;
  };
  if (data.status !== "OK" || !data.results?.[0]) {
    throw new Error(data.error_message || `住所の座標変換に失敗しました（${data.status}）`);
  }
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

/**
 * 車移動分（Routes API computeRouteMatrix）。
 * 失敗時は Distance Matrix Legacy、それでも失敗ならハバーサイン概算。
 */
export async function fetchDriveMinutes(from: LatLng, to: LatLng): Promise<number> {
  const key = mapsKey();
  if (!key) return estimateDriveMinutes(from, to);

  try {
    return await routesMatrixMinutes(from, to, key);
  } catch (e) {
    console.warn("[maps] Routes API failed, trying Distance Matrix legacy", e);
  }
  try {
    return await legacyDistanceMatrixMinutes(from, to, key);
  } catch (e) {
    console.warn("[maps] Distance Matrix failed, using haversine", e);
    return estimateDriveMinutes(from, to);
  }
}

async function routesMatrixMinutes(from: LatLng, to: LatLng, key: string): Promise<number> {
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
    },
    body: JSON.stringify({
      origins: [{ waypoint: { location: { latLng: { latitude: from.lat, longitude: from.lng } } } }],
      destinations: [{ waypoint: { location: { latLng: { latitude: to.lat, longitude: to.lng } } } }],
      travelMode: "DRIVE",
      languageCode: "ja-JP",
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Routes API ${res.status}: ${text.slice(0, 200)}`);
  }

  // NDJSON or JSON array
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let durationSec: number | null = null;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as {
        duration?: string;
        status?: string;
        condition?: string;
        error?: { message?: string };
      };
      if (row.error) continue;
      if (row.duration) {
        // "123s"
        const m = /^(\d+)s$/.exec(row.duration);
        if (m) {
          durationSec = Number(m[1]);
          break;
        }
      }
    } catch {
      // ignore
    }
  }
  if (durationSec == null) {
    // single JSON object?
    try {
      const one = JSON.parse(text) as { duration?: string };
      const m = one.duration ? /^(\d+)s$/.exec(one.duration) : null;
      if (m) durationSec = Number(m[1]);
    } catch {
      /* ignore */
    }
  }
  if (durationSec == null) throw new Error("Routes API: duration missing");
  return Math.max(1, Math.ceil(durationSec / 60));
}

async function legacyDistanceMatrixMinutes(from: LatLng, to: LatLng, key: string): Promise<number> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${from.lat},${from.lng}`);
  url.searchParams.set("destinations", `${to.lat},${to.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    rows?: { elements: { status: string; duration?: { value: number } }[] }[];
    error_message?: string;
  };
  const el = data.rows?.[0]?.elements?.[0];
  if (data.status !== "OK" || !el || el.status !== "OK" || !el.duration) {
    throw new Error(data.error_message || `Distance Matrix ${data.status}/${el?.status}`);
  }
  return Math.max(1, Math.ceil(el.duration.value / 60));
}
