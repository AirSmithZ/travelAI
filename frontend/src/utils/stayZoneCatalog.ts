/** HOT-ZONE-CATALOG D: resolve closed stay-zone catalog by city / segment. */

import type { RecommendedStayZone } from '../types/stayZone';
import {
  HCMC_CATALOG_CITY_KEYS,
  HCMC_STAY_ZONE_CATALOG,
  type StayZoneCatalogEntry,
} from '../data/stayZoneCatalog/hcmc';
import {
  DANANG_CATALOG_CITY_KEYS,
  DANANG_STAY_ZONE_CATALOG,
} from '../data/stayZoneCatalog/danang';

export type { StayZoneCatalogEntry };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

export function catalogCityMatches(city: string, keys: string[]): boolean {
  const n = norm(city);
  if (!n) return false;
  return keys.some((k) => {
    const kk = norm(k);
    return n.includes(kk) || kk.includes(n);
  });
}

export function getStayZoneCatalogForCity(city: string): StayZoneCatalogEntry[] {
  if (catalogCityMatches(city, HCMC_CATALOG_CITY_KEYS)) {
    return HCMC_STAY_ZONE_CATALOG;
  }
  if (catalogCityMatches(city, DANANG_CATALOG_CITY_KEYS)) {
    return DANANG_STAY_ZONE_CATALOG;
  }
  return [];
}

export function hasStayZoneCatalog(city: string): boolean {
  return getStayZoneCatalogForCity(city).length > 0;
}

/** Rank catalog: theme overlap with preference tags first, then label. */
export function rankCatalogEntries(
  entries: StayZoneCatalogEntry[],
  preferenceTags: string[] = [],
): StayZoneCatalogEntry[] {
  const tags = preferenceTags.map(norm).filter(Boolean);
  const score = (e: StayZoneCatalogEntry) => {
    let s = 0;
    for (const t of e.themes ?? []) {
      const tn = norm(t);
      if (tags.some((x) => x.includes(tn) || tn.includes(x))) s += 2;
    }
    const blob = `${e.label} ${e.label_en || ''}`.toLowerCase();
    for (const x of tags) {
      if (x && blob.includes(x)) s += 1;
    }
    return s;
  };
  return [...entries].sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label, 'zh'));
}

/** Knife3: apply LLM/id order; drop unknown; append missing catalog ids. */
export function orderCatalogByIds(
  entries: StayZoneCatalogEntry[],
  orderedIds: string[] | null | undefined,
): StayZoneCatalogEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const out: StayZoneCatalogEntry[] = [];
  for (const raw of orderedIds ?? []) {
    const id = String(raw || '').trim();
    const e = byId.get(id);
    if (e && !seen.has(id)) {
      out.push(e);
      seen.add(id);
    }
  }
  for (const e of entries) {
    if (!seen.has(e.id)) {
      out.push(e);
      seen.add(e.id);
    }
  }
  return out;
}

export function catalogEntriesToStayZones(
  entries: StayZoneCatalogEntry[],
  opts: {
    check_in: string;
    check_out: string;
    preferenceTags?: string[];
    orderedIds?: string[] | null;
  },
): RecommendedStayZone[] {
  const ranked = opts.orderedIds
    ? orderCatalogByIds(entries, opts.orderedIds)
    : rankCatalogEntries(entries, opts.preferenceTags);
  return ranked.map((e, i) => ({
    id: e.id,
    sequence: i + 1,
    city: e.city,
    label: e.label,
    check_in: opts.check_in,
    check_out: opts.check_out,
    rationale: `片区目录（HOT-ZONE-CATALOG）· ${e.label_en || e.label}。可搜店范围供参考，房价以 Trip/RollingGo 为准。`,
    transit_note: e.transit_note,
    strategy: 'main_cluster' as const,
    anchor_hints: [e.search_query],
    status: 'proposed' as const,
    geometry: {
      type: 'circle' as const,
      center: { lat: e.lat, lng: e.lng },
      radius_m: e.radius_m,
    },
    fit_tag: 'current_anchor' as const,
    bookable: true,
    tag_note: '封闭片区目录 · 非 LLM 编造',
    matched_themes: (e.themes ?? []).slice(0, 3).map((id) => ({
      id,
      label: id,
    })),
  }));
}

/**
 * Merge catalog load with existing zones: keep confirmed/rejected;
 * replace proposed catalog/llm with new catalog list.
 * Temp map zones (temp:map:*) that are proposed are replaced unless confirmed.
 */
export function mergeCatalogIntoZones(
  existing: RecommendedStayZone[] | undefined,
  catalogZones: RecommendedStayZone[],
): RecommendedStayZone[] {
  const keep = (existing ?? []).filter(
    (z) => z.status === 'confirmed' || z.status === 'rejected',
  );
  const keepIds = new Set(keep.map((z) => z.id));
  const fresh = catalogZones.filter((z) => !keepIds.has(z.id));
  return [...keep, ...fresh].map((z, i) => ({ ...z, sequence: i + 1 }));
}

/** Knife3: map-click temporary search circle (not inventory). */
export function buildTempMapStayZone(opts: {
  lat: number;
  lng: number;
  city: string;
  check_in: string;
  check_out: string;
  radius_m?: number;
}): RecommendedStayZone {
  const id = `temp:map:${Date.now().toString(36)}`;
  const radius = opts.radius_m ?? 1200;
  return {
    id,
    sequence: 1,
    city: opts.city,
    label: `地图临时区 · ${opts.lat.toFixed(3)}, ${opts.lng.toFixed(3)}`,
    check_in: opts.check_in,
    check_out: opts.check_out,
    rationale:
      '地图点选的临时搜店范围（HOT-ZONE-CATALOG temp）。可确认后「搜附近」；非目录商圈、非库存保证。',
    strategy: 'main_cluster',
    anchor_hints: [`${opts.lat.toFixed(5)},${opts.lng.toFixed(5)}`],
    status: 'proposed',
    geometry: {
      type: 'circle',
      center: { lat: opts.lat, lng: opts.lng },
      radius_m: radius,
    },
    fit_tag: 'current_anchor',
    bookable: true,
    tag_note: '地图临时搜店区 · 非目录',
  };
}
