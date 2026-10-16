/** HOT-SWAP-01 / TRN-05 / FLOW-MC-1 smoke tests */
import assert from 'node:assert/strict';
import {
  applyHotelDayLoop,
  estimateCommuteEdge,
  hasLockedHotel,
} from './hotelDayLoop.ts';
import {
  allSegmentsHaveLockedHotel,
  deriveSegments,
  missingSegmentLocks,
} from './citySegments.ts';
import type { Itinerary } from '../types/itinerary.ts';
import type { ConfirmedHotelStay } from '../types/travelIntel.ts';
import type { TripRequest } from '../types/tripRequest.ts';

function hotel(
  partial: Partial<ConfirmedHotelStay> & Pick<ConfirmedHotelStay, 'id' | 'name'>,
): ConfirmedHotelStay {
  return {
    sequence: 1,
    city: '胡志明',
    check_in: '2026-10-01',
    check_out: '2026-10-04',
    is_primary: true,
    is_anchor: true,
    booking_status: 'selected',
    lat: 10.77,
    lng: 106.7,
    ...partial,
  };
}

function sampleItinerary(): Itinerary {
  return {
    title: 't',
    destination: '越南',
    days: [
      {
        day_index: 1,
        date: '2026-10-01',
        nodes: [
          {
            id: 'd1-a',
            name: '景点A',
            category: 'attraction',
            lat: 10.77,
            lng: 106.7,
          },
        ],
        edges: [],
      },
      {
        day_index: 2,
        date: '2026-10-02',
        nodes: [
          {
            id: 'd2-a',
            name: '景点B',
            category: 'attraction',
            lat: 10.78,
            lng: 106.71,
          },
        ],
        edges: [],
      },
      {
        day_index: 3,
        date: '2026-10-03',
        nodes: [
          {
            id: 'd3-a',
            name: '芽庄海',
            category: 'attraction',
            lat: 12.24,
            lng: 109.19,
          },
        ],
        edges: [],
      },
    ],
  };
}

{
  const a = {
    id: 'n1',
    name: 'A',
    category: 'hotel' as const,
    lat: 10.77,
    lng: 106.7,
  };
  const b = {
    id: 'n2',
    name: 'B',
    category: 'attraction' as const,
    lat: 10.771,
    lng: 106.701,
  };
  const e = estimateCommuteEdge(a, b, 'e1');
  assert.equal(e.route_source, 'estimate');
  assert.ok((e.distance_meters ?? 0) > 0);
  assert.notEqual(e.duration_minutes, 20);
  console.log('estimateCommuteEdge OK');
}

{
  const it = sampleItinerary();
  const h1 = hotel({
    id: 'h1',
    name: '酒店一',
    check_in: '2026-10-01',
    check_out: '2026-10-02',
    sequence: 1,
  });
  const hSea = hotel({
    id: 'hSea',
    name: '海边店',
    city: '芽庄',
    check_in: '2026-10-02',
    check_out: '2026-10-04',
    sequence: 2,
    lat: 12.24,
    lng: 109.19,
  });
  const first = applyHotelDayLoop(it, [h1, hSea], []);
  const day3Before = first.itinerary.days[2].nodes.map((n) => n.name).join(',');
  assert.ok(day3Before.includes('海边店'), 'day3 should be sea hotel before replace');

  const h2 = hotel({
    id: 'h2',
    name: '酒店二替换',
    check_in: '2026-10-01',
    check_out: '2026-10-05',
    sequence: 1,
  });
  const scoped = applyHotelDayLoop(first.itinerary, [h2, hSea], [], undefined, {
    scopeHotelIds: [h2.id],
    replaceHotelId: 'h1',
  });
  const day3After = scoped.itinerary.days[2].nodes.map((n) => n.name).join(',');
  assert.equal(day3After, day3Before, 'scoped replace must not rewrite other hotel days');
  const d1Hotels = scoped.itinerary.days[0].nodes.filter((n) => n.category === 'hotel');
  assert.ok(d1Hotels.some((n) => n.name.includes('酒店二')));
  console.log('scoped hotel replace OK');
}

{
  const tr: TripRequest = {
    free_text: '',
    destination: '越南',
    preference_tags: [],
    segments: [
      { id: 'seg_1', city: '胡志明', date_start: '2026-10-01', date_end: '2026-10-03' },
      { id: 'seg_2', city: '芽庄', date_start: '2026-10-03', date_end: '2026-10-05' },
    ],
  };
  assert.equal(deriveSegments(tr).length, 2);
  const onlyHcmc = [hotel({ id: 'h1', name: 'A', city: '胡志明', segment_id: 'seg_1' })];
  assert.equal(allSegmentsHaveLockedHotel(tr, onlyHcmc), false);
  assert.deepEqual(
    missingSegmentLocks(tr, onlyHcmc).map((s) => s.city),
    ['芽庄'],
  );
  const both = [
    ...onlyHcmc,
    hotel({
      id: 'h2',
      name: 'B',
      city: '芽庄',
      segment_id: 'seg_2',
      lat: 12.24,
      lng: 109.19,
    }),
  ];
  assert.equal(allSegmentsHaveLockedHotel(tr, both), true);
  assert.equal(hasLockedHotel(onlyHcmc), true);
  console.log('citySegments gate OK');
}

console.log('all hotelDayLoop / citySegments tests OK');
