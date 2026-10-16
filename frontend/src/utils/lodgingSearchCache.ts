/**
 * P120 / HOT-02d / HOT-ZONE-CATALOG D:
 * lodging search L2 (localStorage) + L1 (memory).
 *
 * Strategy (explicit):
 * - Non-empty hits: long TTL (LODGING_LS_TTL_MS), reused across refresh.
 * - Empty / trip_first with no pins: short TTL empty miss (LODGING_EMPTY_TTL_MS)
 *   so rapid re-clicks do not hammer RollingGo; user can force「重新搜索」bypass.
 * - Never treat empty miss as a success hit for map pins.
 */

import type { StayZoneLodgingCandidate } from '../api/stayZones';

const STORAGE_KEY = 'travel.lodging.search.v1';
/** Hotel pins are stable; longer than in-memory fare cache. */
export const LODGING_LS_TTL_MS = 12 * 60 * 60 * 1000;
/** HOT-ZONE-CATALOG knife2: empty-result cooldown before auto re-fetch. */
export const LODGING_EMPTY_TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 40;

export type LodgingSearchCacheValue = {
  candidates: StayZoneLodgingCandidate[];
  warnings?: string[];
  query?: string;
};

type CacheEntry = LodgingSearchCacheValue & {
  fetchedAt: number;
  /** True = empty miss / cooldown shell (short TTL). */
  empty?: boolean;
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
 * Same search key: hub + radius + city + stay dates (+ optional catalog id).
 * zone UUID intentionally omitted so re-recommend still hits; catalog_id is stable.
 */
export function lodgingPersistCacheKey(parts: {
  lat: number;
  lng: number;
  radiusM: number;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  catalogId?: string;
}): string {
  const city = (parts.city || '').trim().toLowerCase().replace(/\s+/g, '');
  const cin = (parts.checkIn || '').trim().slice(0, 10);
  const cout = (parts.checkOut || '').trim().slice(0, 10);
  const cat = (parts.catalogId || '').trim();
  return [
    'v2',
    parts.lat.toFixed(4),
    parts.lng.toFixed(4),
    String(Math.round(parts.radiusM)),
    city,
    cin,
    cout,
    cat,
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

function entryAlive(e: CacheEntry, now: number): boolean {
  if (!e || typeof e.fetchedAt !== 'number') return false;
  if (e.empty) {
    return now - e.fetchedAt <= LODGING_EMPTY_TTL_MS;
  }
  return (
    now - e.fetchedAt <= LODGING_LS_TTL_MS &&
    Array.isArray(e.candidates) &&
    e.candidates.length > 0
  );
}

function prune(store: CacheStore, now: number): CacheStore {
  const entries = Object.entries(store).filter(([, e]) => entryAlive(e, now));
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

/** Successful non-empty hit only. */
export function getLodgingSearchCache(
  key: string,
): { value: LodgingSearchCacheValue; fetchedAt: number } | null {
  if (!key) return null;
  const now = Date.now();
  const store = readStore();
  const hit = store[key];
  if (!hit || hit.empty || !Array.isArray(hit.candidates) || hit.candidates.length === 0) {
    return null;
  }
  if (now - hit.fetchedAt > LODGING_LS_TTL_MS) {
    delete store[key];
    writeStore(store);
    return null;
  }
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

/**
 * Empty-result cooldown (knife2). Returns remaining ms while active.
 * Does not count as a pin-bearing cache hit.
 */
export function getLodgingEmptyCache(
  key: string,
): { fetchedAt: number; remainingMs: number; warnings?: string[] } | null {
  if (!key) return null;
  const now = Date.now();
  const store = readStore();
  const hit = store[key];
  if (!hit?.empty) return null;
  const age = now - hit.fetchedAt;
  if (age > LODGING_EMPTY_TTL_MS) {
    delete store[key];
    writeStore(store);
    return null;
  }
  memoryStore[key] = hit;
  return {
    fetchedAt: hit.fetchedAt,
    remainingMs: Math.max(0, LODGING_EMPTY_TTL_MS - age),
    warnings: hit.warnings,
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

/** Record empty / no-pin miss with short TTL (overwrites prior entry for key). */
export function setLodgingEmptyCache(
  key: string,
  opts?: { warnings?: string[] },
): void {
  if (!key) return;
  const now = Date.now();
  const store = prune(readStore(), now);
  store[key] = {
    candidates: [],
    empty: true,
    warnings: opts?.warnings,
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

export function formatLodgingEmptyCooldown(remainingMs: number): string {
  const sec = Math.max(1, Math.ceil(remainingMs / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.ceil(sec / 60)} 分钟`;
}
