import type { StayZoneLodgingCandidate } from '../../api/stayZones';
import type { GeocodeCandidate } from '../../api/geocode';
import { isValidMapCoord } from '../../utils/mapCoordGuards';

/** Which module last drove map pins / draft highlight. */
export type ZoneHotelModuleSource = 'area_lodging' | 'name_search';

export type ZoneHotelCandidate = StayZoneLodgingCandidate;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function geocodeHitToCandidate(
  c: GeocodeCandidate,
  hub?: { lat: number; lng: number } | null,
): ZoneHotelCandidate | null {
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  if (!isValidMapCoord(lat, lng)) return null;
  const distance_m =
    hub && isValidMapCoord(hub.lat, hub.lng)
      ? Math.round(haversineM(hub.lat, hub.lng, lat, lng))
      : 0;
  return {
    name: c.name,
    lat,
    lng,
    address: c.address ?? null,
    place_id: c.place_id ?? null,
    distance_m,
    coord_source: c.coord_source || 'serpapi',
  };
}

export function candidateKey(c: ZoneHotelCandidate): string {
  return c.place_id || `${c.lat}-${c.lng}-${c.name}`;
}

export function isSameCandidate(
  a: ZoneHotelCandidate | null | undefined,
  b: ZoneHotelCandidate | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.place_id && b.place_id) return a.place_id === b.place_id;
  return a.name === b.name && a.lat === b.lat && a.lng === b.lng;
}
