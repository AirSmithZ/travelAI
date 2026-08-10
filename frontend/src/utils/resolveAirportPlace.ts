import { searchAirports, type AirportMatchType, type AirportSearchHit } from '../api/flights';

export interface ResolvedAirportPlace {
  iata: string;
  /** Chinese city when available — preferred for hotel / geocode bias. */
  cityLabel: string;
  matchType: AirportMatchType;
  label: string;
}

function isIataCode(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value.trim());
}

function cityLabelFromHit(hit: AirportSearchHit): string {
  return (hit.city_zh || hit.city || hit.name_zh || hit.name || hit.iata).trim();
}

/**
 * Resolve a free-text place (city / country / IATA) via `/flights/airports`
 * before OD autofill or flight search.
 *
 * Country queries (e.g. 新西兰) map to the top hub (AKL). Unknown places → null
 * so callers do not fill Ignav-invalid tokens like a bare country name.
 */
export async function resolveAirportPlace(
  query: string,
): Promise<ResolvedAirportPlace | null> {
  const q = (query || '').trim();
  if (!q) return null;

  try {
    const res = await searchAirports(q, 8);
    const results = res.results ?? [];
    if (!results.length) return null;

    let hit: AirportSearchHit | undefined;
    if (isIataCode(q)) {
      const iata = q.toUpperCase();
      hit = results.find((r) => r.iata.toUpperCase() === iata) ?? results[0];
    } else {
      hit = results[0];
    }
    if (!hit?.iata) return null;

    const iata = hit.iata.trim().toUpperCase();
    if (!isIataCode(iata)) return null;

    return {
      iata,
      cityLabel: cityLabelFromHit(hit),
      matchType: hit.match_type,
      label: (hit.label || `${cityLabelFromHit(hit)}（${iata}）`).trim(),
    };
  } catch {
    return null;
  }
}

export async function resolveAirportPlacePair(
  origin: string,
  destination: string,
): Promise<{
  origin: ResolvedAirportPlace | null;
  destination: ResolvedAirportPlace | null;
}> {
  const [o, d] = await Promise.all([
    resolveAirportPlace(origin),
    resolveAirportPlace(destination),
  ]);
  return { origin: o, destination: d };
}
