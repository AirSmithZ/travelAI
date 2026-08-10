/**
 * P120 / HOT-02d: lodging search results in localStorage (L2) + memory (L1).
 * Same hub+radius → reuse across refresh; never persist empty / 429 shells.
 * Pattern mirrors evidenceLinkCache.ts.
 */

import type { StayZoneLodgingCandidate } from '../api/stayZones';

const STORAGE_KEY = 'travel.lodging.search.v1';
/** Hotel pins are stable; longer than in-memory fare cache. */
export const LODGING_LS_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;

export type LodgingSearchCacheValue = {
  candidates: StayZoneLodgingCandidate[];
  warnings?: string[];
  query?: string;
};

type CacheEntry = LodgingSearchCacheValue & {
  fetchedAt: number;
};

type CacheStore = Record<string, CacheEntry>;

let memoryStore: CacheStore = {};

function storageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__lodging_cache_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Same search key: hub + radius (+ optional city). zoneId intentionally omitted
 * so re-recommend with new zone ids still hits.
 */
export function lodgingPersistCacheKey(parts: {
  lat: number;
  lng: number;
  radiusM: number;
  city?: string;
}): string {
  const city = (parts.city || '').trim().toLowerCase().replace(/\s+/g, '');
  return [
    'v1',
    parts.lat.toFixed(4),
    parts.lng.toFixed(4),
    String(Math.round(parts.radiusM)),
    city,
  ].join('|');
}

function readStore(): CacheStore {
  if (!storageAvailable()) return { ...memoryStore };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { ...memoryStore };
  }
}

function writeStore(store: CacheStore): void {
  memoryStore = store;
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — keep memory only */
  }
}

function prune(store: CacheStore, now: number): CacheStore {
  const entries = Object.entries(store).filter(
    ([, e]) =>
      e &&
      typeof e.fetchedAt === 'number' &&
      now - e.fetchedAt <= LODGING_LS_TTL_MS &&
      Array.isArray(e.candidates) &&
      e.candidates.length > 0,
  );
  entries.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

/** Test helper */
export function clearLodgingSearchCache(): void {
  memoryStore = {};
  if (storageAvailable()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function getLodgingSearchCache(
  key: string,
): { value: LodgingSearchCacheValue; fetchedAt: number } | null {
  if (!key) return null;
  const now = Date.now();
  const store = readStore();
  const hit = store[key];
  if (!hit || !Array.isArray(hit.candidates) || hit.candidates.length === 0) {
    return null;
  }
  if (now - hit.fetchedAt > LODGING_LS_TTL_MS) {
    delete store[key];
    writeStore(store);
    return null;
  }
  // Warm L1 mirror
  memoryStore[key] = hit;
  return {
    value: {
      candidates: hit.candidates,
      warnings: hit.warnings,
      query: hit.query,
    },
    fetchedAt: hit.fetchedAt,
  };
}

/** Only persist successful non-empty candidate lists. */
export function setLodgingSearchCache(
  key: string,
  value: LodgingSearchCacheValue,
): void {
  if (!key || !value.candidates?.length) return;
  const now = Date.now();
  const store = prune(readStore(), now);
  store[key] = {
    candidates: value.candidates,
    warnings: value.warnings,
    query: value.query,
    fetchedAt: now,
  };
  writeStore(prune(store, now));
}

export function formatLodgingCacheAge(fetchedAt: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (sec < 60) return `${sec}s 前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} 小时前`;
  return `${Math.round(hr / 24)} 天前`;
}
