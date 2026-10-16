import {
  appendCitySegment,
  allSegmentsHaveLockedHotel,
  cityForDayDate,
  deriveSegments,
  validateSegmentOrder,
  zoneCityInSegments,
} from './citySegments';
import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedFlightLeg, ConfirmedHotelStay } from '../types/travelIntel';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const baseTr: TripRequest = {
  destination: '胡志明市',
  date_start: '2026-10-01',
  date_end: '2026-10-06',
  day_count: 5,
  travelers: 2,
  preference_tags: [],
  free_text: '',
  notes: '',
};

{
  const segs = deriveSegments(baseTr);
  assert(segs.length === 1 && segs[0].city === '胡志明市', 'synthetic single segment');
}

{
  const { trip_request, segment, created } = appendCitySegment(baseTr, '芽庄', {
    date_start: '2026-10-04',
    date_end: '2026-10-06',
  });
  assert(created, 'append creates segment');
  assert(segment.city === '芽庄' && segment.id === 'seg_2', 'second segment id');
  assert((trip_request.segments?.length ?? 0) === 2, 'materialized 2 segments');
  assert(zoneCityInSegments(trip_request, '芽庄'), 'zone city in segments');

  const again = appendCitySegment(trip_request, '芽庄');
  assert(!again.created, 'append idempotent');

  const hotels: ConfirmedHotelStay[] = [
    {
      id: 'h1',
      sequence: 1,
      city: '胡志明市',
      name: 'A',
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      is_primary: true,
      is_anchor: true,
      booking_status: 'selected',
      lat: 10.7,
      lng: 106.7,
      segment_id: 'seg_1',
    },
  ];
  assert(!allSegmentsHaveLockedHotel(trip_request, hotels), 'missing seg_2 lock');
  hotels.push({
    id: 'h2',
    sequence: 2,
    city: '芽庄',
    name: 'B',
    check_in: '2026-10-04',
    check_out: '2026-10-06',
    is_primary: true,
    is_anchor: true,
    booking_status: 'selected',
    lat: 12.2,
    lng: 109.2,
    segment_id: 'seg_2',
  });
  assert(allSegmentsHaveLockedHotel(trip_request, hotels), 'both segments locked');

  const flights: ConfirmedFlightLeg[] = [
    {
      id: 'f1',
      sequence: 1,
      role: 'outbound',
      origin_iata: 'PVG',
      dest_iata: 'SGN',
      depart_at: '2026-10-01T08:00:00+08:00',
      arrive_at: '2026-10-01T12:00:00+08:00',
      airline: 'VJ',
      stops: 0,
      duration_minutes: 240,
      quote: {} as never,
      quote_id: 'q1',
      booking_status: 'selected',
      is_anchor: true,
    },
  ];
  const warn = validateSegmentOrder(trip_request, flights);
  assert(
    warn.some((i) => i.code === 'missing_intercity' && i.severity === 'warn'),
    'missing intercity warn',
  );

  const overlapTr: TripRequest = {
    ...trip_request,
    segments: [
      { id: 'seg_1', city: '胡志明市', date_start: '2026-10-01', date_end: '2026-10-05' },
      { id: 'seg_2', city: '芽庄', date_start: '2026-10-03', date_end: '2026-10-06' },
    ],
  };
  const hard = validateSegmentOrder(overlapTr, flights);
  assert(
    hard.some((i) => i.code === 'segment_date_overlap' && i.severity === 'hard'),
    'date overlap hard',
  );
}

{
  const tr: TripRequest = {
    ...baseTr,
    segments: [
      { id: 'seg_1', city: '胡志明市', date_start: '2026-10-01', date_end: '2026-10-04' },
      { id: 'seg_2', city: '芽庄', date_start: '2026-10-04', date_end: '2026-10-07' },
    ],
  };
  const hotels: ConfirmedHotelStay[] = [
    {
      id: 'h2',
      sequence: 2,
      city: '芽庄',
      name: 'B',
      check_in: '2026-10-04',
      check_out: '2026-10-07',
      is_primary: true,
      is_anchor: true,
      booking_status: 'selected',
      lat: 12.2,
      lng: 109.2,
      segment_id: 'seg_2',
    },
  ];
  const d = cityForDayDate('2026-10-05', tr, hotels);
  assert(d?.city === '芽庄' && d.segment_id === 'seg_2', 'cityForDayDate hotel');
}

console.log('citySegments.test.ts OK');
