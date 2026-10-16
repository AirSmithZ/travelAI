import {
  bindLegsToSegments,
  cityLabelFromIata,
  ensureSegmentForFlightLeg,
  nextSegmentCityForIntercity,
} from './flightSegmentSync';
import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedFlightLeg } from '../types/travelIntel';
import { createEmptyTripRequest } from '../types/tripRequest';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(cityLabelFromIata('SGN') === '胡志明市', 'SGN label');

{
  const tr = createEmptyTripRequest();
  tr.destination = '胡志明市';
  tr.date_start = '2026-10-01';
  tr.date_end = '2026-10-08';
  const r = ensureSegmentForFlightLeg(tr, {
    role: 'outbound',
    dest_iata: 'SGN',
    arrive_at: '2026-10-01T12:00:00+07:00',
  });
  assert(r.segment_id === 'seg_1', 'outbound → seg_1');
  assert((r.trip_request.segments?.length ?? 0) >= 1, 'materialize segments');
  assert(r.trip_request.segments?.[0]?.city === '胡志明市', 'hub city');
}

{
  let tr: TripRequest = {
    ...createEmptyTripRequest(),
    destination: '胡志明市',
    date_start: '2026-10-01',
    date_end: '2026-10-08',
    segments: [
      { id: 'seg_1', city: '胡志明市', date_start: '2026-10-01', date_end: '2026-10-04', role: 'hub' },
      { id: 'seg_2', city: '芽庄', date_start: '2026-10-04', date_end: '2026-10-08', role: 'leg' },
    ],
  };
  const outbound: ConfirmedFlightLeg = {
    id: 'f1',
    sequence: 1,
    role: 'outbound',
    origin_iata: 'PVG',
    dest_iata: 'SGN',
    depart_at: '2026-10-01T08:00:00+08:00',
    arrive_at: '2026-10-01T12:00:00+07:00',
    airline: 'VJ',
    stops: 0,
    duration_minutes: 240,
    quote: {} as never,
    quote_id: 'q1',
    booking_status: 'selected',
    is_anchor: true,
  };
  const bound1 = bindLegsToSegments(tr, [outbound]);
  assert(bound1.legs[0]?.segment_id === 'seg_1', 'outbound bound seg_1');
  tr = bound1.trip_request;

  assert(nextSegmentCityForIntercity(tr, bound1.legs) === '芽庄', 'next city 芽庄');

  const intercity: ConfirmedFlightLeg = {
    ...outbound,
    id: 'f2',
    sequence: 2,
    role: 'intercity',
    origin_iata: 'SGN',
    dest_iata: 'CXR',
    quote_id: 'q2',
  };
  // CXR may not be in labels → city = CXR; append as new unless we use 芽庄 label
  // Prefer confirming with known path: append via DLI-like unknown creates new city
  const viaLabel = ensureSegmentForFlightLeg(tr, {
    role: 'intercity',
    dest_iata: 'SIN', // Singapore — known label, appends if not in segments
    arrive_at: '2026-10-04T10:00:00+07:00',
  });
  assert(viaLabel.created, 'intercity to new city creates segment');
  assert(viaLabel.segment_id === 'seg_3', 'third segment');
  assert(
    viaLabel.trip_request.segments?.some((s) => s.city === '新加坡'),
    '新加坡 segment',
  );
}

{
  // Idempotent: intercity dest already a segment
  const tr: TripRequest = {
    ...createEmptyTripRequest(),
    destination: '胡志明市',
    segments: [
      { id: 'seg_1', city: '胡志明市', role: 'hub' },
      { id: 'seg_2', city: '新加坡', role: 'leg' },
    ],
  };
  const r = ensureSegmentForFlightLeg(tr, {
    role: 'intercity',
    dest_iata: 'SIN',
  });
  assert(!r.created && r.segment_id === 'seg_2', 'reuse existing segment');
}

console.log('flightSegmentSync.test.ts OK');
