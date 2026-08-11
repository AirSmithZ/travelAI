/** doc 34: build generate user_evidence from adopted paste modules only. */

import type { ItineraryEvidenceItem } from '../types/itinerary';
import type { AdoptPoiLevel, EvidenceLinkModule } from '../types/travelPlan';

export function moduleHasAdopt(mod: EvidenceLinkModule): boolean {
  return (
    mod.status === 'ok' &&
    Boolean(mod.result) &&
    ((mod.adoptedPois?.length ?? 0) > 0 || Boolean(mod.adoptRhythm))
  );
}

export function countAdoptedModules(modules: EvidenceLinkModule[] | undefined): number {
  return (modules ?? []).filter(moduleHasAdopt).length;
}

export function resolveAdoptLevel(
  mod: EvidenceLinkModule,
  name: string,
): AdoptPoiLevel | null {
  const n = name.trim();
  if (!n) return null;
  const adopted = (mod.adoptedPois ?? []).some((x) => x.toLowerCase() === n.toLowerCase());
  if (!adopted) return null;
  const levels = mod.adoptLevels ?? {};
  const hit = Object.entries(levels).find(([k]) => k.toLowerCase() === n.toLowerCase());
  return (hit?.[1] as AdoptPoiLevel | undefined) ?? 'nice';
}

export function buildAdoptLevelsPayload(
  mod: EvidenceLinkModule,
  adopted: string[],
): Record<string, AdoptPoiLevel> {
  const out: Record<string, AdoptPoiLevel> = {};
  for (const name of adopted) {
    out[name] = resolveAdoptLevel(mod, name) ?? 'nice';
  }
  return out;
}

/** Payload for POST generate — only modules with user adopt. */
export function buildAdoptedUserEvidence(
  modules: EvidenceLinkModule[] | undefined,
  maxItems = 5,
): ItineraryEvidenceItem[] {
  const out: ItineraryEvidenceItem[] = [];
  for (const mod of modules ?? []) {
    if (!moduleHasAdopt(mod) || !mod.result) continue;
    const adopted = [...(mod.adoptedPois ?? [])].map((s) => s.trim()).filter(Boolean);
    const rhythm = Boolean(mod.adoptRhythm);
    const levels = buildAdoptLevelsPayload(mod, adopted);
    const base = mod.result;
    const musts = adopted.filter((n) => levels[n] === 'must');
    const nices = adopted.filter((n) => levels[n] !== 'must');
    let snippet = '';
    if (rhythm) {
      snippet = (base.snippet || '').slice(0, 1000);
    } else if (adopted.length) {
      const bits: string[] = [];
      if (musts.length) bits.push(`必去：${musts.join('、')}`);
      if (nices.length) bits.push(`想去：${nices.join('、')}`);
      snippet = `用户已采纳地点（${bits.join('；')}）。（未勾选「节奏参考」，勿照搬全文日序。）`;
    }
    out.push({
      ...base,
      snippet,
      poi_hits: adopted.length ? adopted : base.poi_hits,
      adopted_pois: adopted,
      adopt_levels: adopted.length ? levels : undefined,
      adopt_rhythm: rhythm,
    } as ItineraryEvidenceItem);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function defaultAdoptSeed(item: ItineraryEvidenceItem): {
  candidatePois: string[];
  adoptedPois: string[];
  adoptLevels: Record<string, AdoptPoiLevel>;
  adoptRhythm: boolean;
} {
  const hits = (item.poi_hits ?? []).map((s) => s.trim()).filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(h);
  }
  // U1: default-check fenced/verified hits as nice; if none, offer rhythm-only
  const adoptedPois = item.verified && unique.length > 0 ? [...unique] : [];
  const adoptLevels: Record<string, AdoptPoiLevel> = {};
  for (const n of adoptedPois) adoptLevels[n] = 'nice';
  const adoptRhythm = unique.length === 0;
  return { candidatePois: unique, adoptedPois, adoptLevels, adoptRhythm };
}
