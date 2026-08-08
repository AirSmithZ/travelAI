/**
 * DATA-10: soft cross-day POI duplicate detection (place_id or name+proximity).
 */
import type { Itinerary } from '../types/itinerary';

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function findCrossDayPoiDuplicates(itinerary: Itinerary | null | undefined): string[] {
  if (!itinerary?.days?.length) return [];
  const warnings: string[] = [];
  type Ref = { day: number; id: string; name: string; lat: number; lng: number; place_id?: string };
  const refs: Ref[] = [];
  for (const day of itinerary.days) {
    for (const n of day.nodes) {
      if (!n.name?.trim()) continue;
      if (n.lat === 0 && n.lng === 0) continue;
      refs.push({
        day: day.day_index,
        id: n.id,
        name: n.name.trim(),
        lat: n.lat,
        lng: n.lng,
        place_id: n.place_id,
      });
    }
  }

  const seen = new Set<string>();
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i]!;
      const b = refs[j]!;
      if (a.day === b.day) continue;
      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;

      const samePlaceId = Boolean(a.place_id && b.place_id && a.place_id === b.place_id);
      const sameName =
        a.name.toLowerCase() === b.name.toLowerCase() &&
        haversineM(a, b) <= 80;
      if (samePlaceId || sameName) {
        seen.add(pairKey);
        warnings.push(
          `跨天重复 POI：D${a.day}「${a.name}」与 D${b.day}「${b.name}」` +
            (samePlaceId ? '（同 place_id）' : '（同名近距）'),
        );
      }
    }
  }
  return warnings;
}
