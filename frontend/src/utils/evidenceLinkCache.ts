import type { ItineraryEvidenceItem } from '../types/itinerary';

const STORAGE_KEY = 'travel.evidence.from_link.v1';
/** Same URL → reuse retrieved note body; default 7 days */
export const EVIDENCE_LINK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 80;

export type EvidenceLinkCachePayload = {
  ok: true;
  item: ItineraryEvidenceItem;
  error: null;
  provider: string | null;
  fromCache: true;
};

type CacheEntry = {
  item: ItineraryEvidenceItem;
  provider: string | null;
  fetchedAt: number;
};

type CacheStore = Record<string, CacheEntry>;

/** In-memory fallback when localStorage is unavailable (SSR / tests). */
let memoryStore: CacheStore = {};

function storageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__evd_cache_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Normalize share / explore URLs so http/https and trailing slash still hit. */
export function evidenceLinkCacheKey(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    const drop = new Set([
      'app_platform',
      'app_version',
      'share_from_user_hidden',
      'xhsshare',
      'shareRedId',
      'apptime',
      'share_id',
      'author_share',
      'back_chain_id',
      'noteAttributes',
      'xsec_source',
      'type',
    ]);
    for (const k of [...u.searchParams.keys()]) {
      if (drop.has(k)) u.searchParams.delete(k);
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    // Keep path case — short codes may be case-sensitive
    const path = u.pathname.replace(/\/+$/, '') || '';
    const qs = u.searchParams.toString();
    // Ignore http/https difference — same short link
    return `${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
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

/** Test helper */
export function clearEvidenceLinkCache(): void {
  memoryStore = {};
  if (storageAvailable()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function prune(store: CacheStore, now: number): CacheStore {
  const entries = Object.entries(store).filter(
    ([, e]) => e && typeof e.fetchedAt === 'number' && now - e.fetchedAt <= EVIDENCE_LINK_CACHE_TTL_MS,
  );
  entries.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

export function getCachedEvidenceFromLink(url: string): EvidenceLinkCachePayload | null {
  const key = evidenceLinkCacheKey(url);
  if (!key) return null;
  const store = readStore();
  const hit = store[key];
  if (!hit?.item?.url && !hit?.item?.title) return null;
  if (Date.now() - hit.fetchedAt > EVIDENCE_LINK_CACHE_TTL_MS) {
    delete store[key];
    writeStore(store);
    return null;
  }
  return {
    ok: true,
    item: hit.item,
    error: null,
    provider: hit.provider,
    fromCache: true,
  };
}

export function setCachedEvidenceFromLink(
  url: string,
  item: ItineraryEvidenceItem,
  provider: string | null,
): void {
  if (!item?.title && !item?.url) return;
  const key = evidenceLinkCacheKey(url);
  if (!key) return;
  const now = Date.now();
  const store = prune(readStore(), now);
  const entry: CacheEntry = { item, provider, fetchedAt: now };
  store[key] = entry;
  const alt = evidenceLinkCacheKey(item.url || '');
  if (alt && alt !== key) store[alt] = entry;
  writeStore(prune(store, now));
}
