/** FLOW-MC: city segments + order helpers (compat with single destination). */

import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedFlightLeg, ConfirmedHotelStay } from '../types/travelIntel';
import { isLockedHotelStay } from './hotelDayLoop';

export interface CitySegment {
  id: string;
  city: string;
  date_start?: string;
  date_end?: string;
  role?: 'hub' | 'leg';
}

export type SegmentOrderIssue = {
  severity: 'hard' | 'warn';
  code: string;
  message: string;
};

function normalizeCity(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function datePrefix(value: string | undefined | null): string {
  const s = (value ?? '').trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Empty / missing segments → one synthetic segment from destination. */
export function deriveSegments(tr: TripRequest): CitySegment[] {
  const raw = tr.segments?.filter((s) => s.city?.trim()) ?? [];
  if (raw.length > 0) {
    return raw.map((s, i) => ({
      id: s.id?.trim() || `seg_${i + 1}`,
      city: s.city.trim(),
      date_start: s.date_start || tr.date_start,
      date_end: s.date_end || tr.date_end,
      role: s.role,
    }));
  }
  const city = (tr.destination || '').trim() || '目的地';
  return [
    {
      id: 'seg_1',
      city,
      date_start: tr.date_start,
      date_end: tr.date_end,
      role: 'hub',
    },
  ];
}

/**
 * FLOW-MC-4: which city/segment a calendar day belongs to.
 * Prefer hotel covers (check_in ≤ day < check_out); else segment date window.
 */
export function cityForDayDate(
  dayDate: string | undefined | null,
  tr: TripRequest,
  hotels?: ConfirmedHotelStay[] | null,
): { city: string; segment_id: string; hotel?: ConfirmedHotelStay } | null {
  const day = datePrefix(dayDate);
  const segs = deriveSegments(tr);
  if (!segs.length) return null;

  if (day && hotels?.length) {
    const hits = hotels.filter((h) => {
      const cin = datePrefix(h.check_in);
      const cout = datePrefix(h.check_out);
      if (cin && cout && cin <= day && day < cout) return true;
      if (cin && cout && cin === cout && cin === day) return true;
      return false;
    });
    if (hits.length) {
      const hotel = [...hits].sort((a, b) => a.sequence - b.sequence).at(-1)!;
      let segment_id = hotel.segment_id?.trim() || '';
      if (!segment_id && hotel.city?.trim()) {
        segment_id =
          segs.find((s) => normalizeCity(s.city) === normalizeCity(hotel.city))?.id ||
          segs[0].id;
      }
      if (!segment_id) segment_id = segs[0].id;
      const city =
        hotel.city?.trim() ||
        segs.find((s) => s.id === segment_id)?.city ||
        segs[0].city;
      return { city, segment_id, hotel };
    }
  }

  if (day) {
    for (const s of segs) {
      const cin = datePrefix(s.date_start);
      const cout = datePrefix(s.date_end);
      if (cin && cout && cin <= day && day < cout) {
        return { city: s.city, segment_id: s.id };
      }
      if (cin && cout && cin === cout && cin === day) {
        return { city: s.city, segment_id: s.id };
      }
    }
    for (const s of segs) {
      const cin = datePrefix(s.date_start);
      const cout = datePrefix(s.date_end);
      if (cin && cout && cin <= day && day <= cout) {
        return { city: s.city, segment_id: s.id };
      }
    }
  }

  return { city: segs[0].city, segment_id: segs[0].id };
}

/**
 * Append a city as the next segment (FLOW-MC-2 · 需换城→加段).
 * Idempotent if city already present. Materializes synthetic seg_1 into trip_request.segments.
 */
export function appendCitySegment(
  tr: TripRequest,
  city: string,
  opts?: { date_start?: string; date_end?: string },
): { trip_request: TripRequest; segment: CitySegment; created: boolean } {
  const cityLabel = city.trim();
  if (!cityLabel) {
    const segs = deriveSegments(tr);
    return { trip_request: tr, segment: segs[0], created: false };
  }
  const segs = deriveSegments(tr);
  const existing = segs.find((s) => normalizeCity(s.city) === normalizeCity(cityLabel));
  if (existing) {
    return {
      trip_request: {
        ...tr,
        segments: segs,
      },
      segment: existing,
      created: false,
    };
  }
  const last = segs[segs.length - 1];
  const date_start =
    datePrefix(opts?.date_start) ||
    datePrefix(last.date_end) ||
    datePrefix(tr.date_start) ||
    undefined;
  const date_end =
    datePrefix(opts?.date_end) || datePrefix(tr.date_end) || date_start || undefined;
  const segment: CitySegment = {
    id: `seg_${segs.length + 1}`,
    city: cityLabel,
    date_start,
    date_end,
    role: 'leg',
  };
  const prev = [...segs];
  if (prev.length && date_start && prev[prev.length - 1].date_end) {
    const p = prev[prev.length - 1];
    if (datePrefix(p.date_end) > date_start) {
      prev[prev.length - 1] = { ...p, date_end: date_start };
    }
  }
  return {
    trip_request: { ...tr, segments: [...prev, segment] },
    segment,
    created: true,
  };
}

function hotelMatchesSegment(h: ConfirmedHotelStay, seg: CitySegment): boolean {
  if (h.segment_id && h.segment_id === seg.id) return true;
  if (h.segment_id && h.segment_id !== seg.id) return false;
  if (h.city?.trim()) return normalizeCity(h.city) === normalizeCity(seg.city);
  return seg.id === 'seg_1';
}

/** Single-segment trips: any locked hotel. Multi-segment: every segment needs a lock. */
export function allSegmentsHaveLockedHotel(
  tr: TripRequest,
  hotels: ConfirmedHotelStay[] | undefined,
): boolean {
  const segs = deriveSegments(tr);
  const locked = (hotels ?? []).filter(isLockedHotelStay);
  if (!locked.length) return false;
  if (segs.length <= 1) return true;
  return segs.every((seg) => locked.some((h) => hotelMatchesSegment(h, seg)));
}

export function missingSegmentLocks(
  tr: TripRequest,
  hotels: ConfirmedHotelStay[] | undefined,
): CitySegment[] {
  const segs = deriveSegments(tr);
  if (segs.length <= 1) return [];
  const locked = (hotels ?? []).filter(isLockedHotelStay);
  return segs.filter((seg) => !locked.some((h) => hotelMatchesSegment(h, seg)));
}

/** True if zone city is already a trip segment (can lock after 加段). */
export function zoneCityInSegments(tr: TripRequest, zoneCity: string): boolean {
  const city = zoneCity.trim();
  if (!city) return false;
  return deriveSegments(tr).some((s) => normalizeCity(s.city) === normalizeCity(city));
}

/**
 * FLOW-MC-ORDER (min): confirmed flight dest sequence vs city segment order.
 * Does not auto-reorder; returns hard/warn issues for UI.
 */
export function validateSegmentOrder(
  tr: TripRequest,
  flights: ConfirmedFlightLeg[] | undefined,
): SegmentOrderIssue[] {
  const segs = deriveSegments(tr);
  const issues: SegmentOrderIssue[] = [];
  if (segs.length <= 1) return issues;

  const legs = [...(flights ?? [])].sort((a, b) => a.sequence - b.sequence);
  const intercity = legs.filter((f) => f.role === 'intercity');
  if (intercity.length + 1 < segs.length) {
    issues.push({
      severity: 'warn',
      code: 'missing_intercity',
      message: `已有 ${segs.length} 个城段，但城际航段不足；请为换城补确认航班`,
    });
  }

  const ret = legs.find((f) => f.role === 'return');
  if (ret && segs.length >= 2) {
    const last = segs[segs.length - 1];
    issues.push({
      severity: 'warn',
      code: 'open_jaw_check',
      message: `返程 ${ret.origin_iata}→${ret.dest_iata}：请确认末段「${last.city}」与返程出发城一致，或安排赶回枢纽`,
    });
  }

  for (let i = 0; i < segs.length - 1; i++) {
    const a = datePrefix(segs[i].date_end);
    const b = datePrefix(segs[i + 1].date_start);
    if (a && b && b < a) {
      issues.push({
        severity: 'hard',
        code: 'segment_date_overlap',
        message: `城段日期冲突：${segs[i].city} 结束 ${a} 晚于 ${segs[i + 1].city} 开始 ${b}`,
      });
    }
  }

  return issues;
}
