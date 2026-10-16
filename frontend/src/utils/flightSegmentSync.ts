/** FLOW-MC-3: bind confirmed flights to city segments; ensure segments from legs. */

import { formatAirportLabel } from '../data/airportLabels';
import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedFlightLeg, FlightLegRole } from '../types/travelIntel';
import {
  appendCitySegment,
  deriveSegments,
  type CitySegment,
} from './citySegments';

function normalizeCity(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function datePrefix(iso: string | undefined | null): string | undefined {
  const s = (iso ?? '').trim();
  return s.length >= 10 ? s.slice(0, 10) : undefined;
}

/** Sync city label from IATA (airportLabels); unknown codes fall back to IATA. */
export function cityLabelFromIata(iata: string): string {
  const code = (iata || '').trim().toUpperCase();
  if (!code) return '';
  const label = formatAirportLabel(code);
  return label === '—' ? code : label;
}

/**
 * On confirm outbound/intercity: ensure trip has a segment for dest city;
 * return segment_id to stamp on the leg. Return legs attach to last segment.
 */
export function ensureSegmentForFlightLeg(
  tr: TripRequest,
  leg: {
    role: FlightLegRole;
    dest_iata: string;
    arrive_at?: string;
  },
): { trip_request: TripRequest; segment_id: string | undefined; created: boolean } {
  const segs = deriveSegments(tr);

  if (leg.role === 'return' || leg.role === 'other') {
    return {
      trip_request: tr,
      segment_id: segs[segs.length - 1]?.id,
      created: false,
    };
  }

  const cityLabel = cityLabelFromIata(leg.dest_iata) || leg.dest_iata.trim().toUpperCase();
  if (!cityLabel) {
    return { trip_request: tr, segment_id: segs[0]?.id, created: false };
  }

  const arriveDay = datePrefix(leg.arrive_at);

  if (leg.role === 'outbound') {
    const existing = segs.find((s) => normalizeCity(s.city) === normalizeCity(cityLabel));
    if (existing) {
      // Materialize synthetic into trip_request.segments when missing
      if (!tr.segments?.length) {
        return {
          trip_request: {
            ...tr,
            destination: tr.destination?.trim() || cityLabel,
            segments: segs.map((s) =>
              s.id === existing.id ? { ...s, city: cityLabel || s.city } : s,
            ),
          },
          segment_id: existing.id,
          created: false,
        };
      }
      return { trip_request: tr, segment_id: existing.id, created: false };
    }
    // First outbound often defines hub: rewrite seg_1 city if still destination placeholder
    if (!tr.segments?.length) {
      const hub: CitySegment = {
        id: 'seg_1',
        city: cityLabel,
        date_start: tr.date_start,
        date_end: tr.date_end,
        role: 'hub',
      };
      return {
        trip_request: {
          ...tr,
          destination: tr.destination?.trim() || cityLabel,
          segments: [hub],
        },
        segment_id: 'seg_1',
        created: true,
      };
    }
    // Unexpected: outbound dest ≠ any segment — append as leg
    const appended = appendCitySegment(tr, cityLabel, { date_start: arriveDay });
    return {
      trip_request: appended.trip_request,
      segment_id: appended.segment.id,
      created: appended.created,
    };
  }

  // intercity → 加段（idempotent）
  const appended = appendCitySegment(tr, cityLabel, { date_start: arriveDay });
  return {
    trip_request: appended.trip_request,
    segment_id: appended.segment.id,
    created: appended.created,
  };
}

/** Stamp segment_id on a batch of new legs; may mutate trip_request (segments). */
export function bindLegsToSegments(
  tr: TripRequest,
  legs: ConfirmedFlightLeg[],
): { trip_request: TripRequest; legs: ConfirmedFlightLeg[]; createdCities: string[] } {
  let trip_request = tr;
  const createdCities: string[] = [];
  const out: ConfirmedFlightLeg[] = [];
  for (const leg of legs) {
    const { trip_request: next, segment_id, created } = ensureSegmentForFlightLeg(trip_request, leg);
    trip_request = next;
    if (created) {
      const city = cityLabelFromIata(leg.dest_iata);
      if (city) createdCities.push(city);
    }
    out.push({ ...leg, segment_id: segment_id || leg.segment_id });
  }
  return { trip_request, legs: out, createdCities };
}

/**
 * Prefill intercity destination from the next city segment after the last arrival.
 * Empty when no further segment is planned (user types freely).
 */
export function nextSegmentCityForIntercity(
  tr: TripRequest,
  flights: ConfirmedFlightLeg[],
): string {
  const segs = deriveSegments(tr);
  if (segs.length <= 1) return '';

  const nonReturn = [...flights]
    .filter((f) => f.role !== 'return')
    .sort((a, b) => a.sequence - b.sequence);
  const last = nonReturn[nonReturn.length - 1];
  if (!last) {
    // No flights yet — next after hub is seg_2 if present
    return segs[1]?.city ?? '';
  }

  let idx = -1;
  if (last.segment_id) {
    idx = segs.findIndex((s) => s.id === last.segment_id);
  }
  if (idx < 0) {
    const label = normalizeCity(cityLabelFromIata(last.dest_iata));
    idx = segs.findIndex((s) => normalizeCity(s.city) === label);
  }
  if (idx < 0) idx = 0;
  return segs[idx + 1]?.city ?? '';
}

/** Active segment for search OD display: last segment, or hub. */
export function activeSegment(tr: TripRequest): CitySegment {
  const segs = deriveSegments(tr);
  return segs[segs.length - 1] ?? segs[0];
}
