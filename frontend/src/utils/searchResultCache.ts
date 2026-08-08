/** UX-FLT-CACHE: in-memory TTL cache for flight / lodging search results. */

export type CacheEntry<T> = {
  value: T;
  fetchedAt: number;
  key: string;
};

const store = new Map<string, CacheEntry<unknown>>();

/** Default TTL: fares stale quickly */
export const FLIGHT_CACHE_TTL_MS = 10 * 60 * 1000;
export const LODGING_CACHE_TTL_MS = 30 * 60 * 1000;

export function cacheGet<T>(
  namespace: string,
  key: string,
  ttlMs: number,
): CacheEntry<T> | null {
  const full = `${namespace}:${key}`;
  const hit = store.get(full) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > ttlMs) {
    store.delete(full);
    return null;
  }
  return hit;
}

export function cacheSet<T>(namespace: string, key: string, value: T): CacheEntry<T> {
  const full = `${namespace}:${key}`;
  const entry: CacheEntry<T> = { value, fetchedAt: Date.now(), key };
  store.set(full, entry as CacheEntry<unknown>);
  return entry;
}

export function cacheInvalidate(namespace: string, key?: string): void {
  if (!key) {
    for (const k of [...store.keys()]) {
      if (k.startsWith(`${namespace}:`)) store.delete(k);
    }
    return;
  }
  store.delete(`${namespace}:${key}`);
}

export function flightCacheKey(parts: {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  adults: number;
  preference: string;
}): string {
  const ret = parts.returnDate?.trim() || '';
  return [
    parts.origin.trim().toUpperCase(),
    parts.destination.trim().toUpperCase(),
    parts.date.trim(),
    ret,
    String(parts.adults),
    parts.preference,
  ].join('|');
}

export function lodgingCacheKey(parts: {
  zoneId: string;
  lat: number;
  lng: number;
  radiusM: number;
}): string {
  return [
    parts.zoneId,
    parts.lat.toFixed(4),
    parts.lng.toFixed(4),
    String(Math.round(parts.radiusM)),
  ].join('|');
}
