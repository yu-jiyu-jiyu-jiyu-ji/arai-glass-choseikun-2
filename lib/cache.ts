type Entry<T> = { value: T; expiresAt: number };

/** プロセス内メモリキャッシュ（Render の同一インスタンス内で有効） */
const store = new Map<string, Entry<unknown>>();

const DEFAULT_TTL_MS = Number(process.env.CHOSEIKUN_CACHE_TTL_MS || 60_000);

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheDeletePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const existing = cacheGet<T>(key);
  if (existing !== undefined) return existing;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

export const CACHE_KEYS = {
  workers: "workers:all",
  bookings: "bookings:all",
  links: "bookingLinks:all",
} as const;
