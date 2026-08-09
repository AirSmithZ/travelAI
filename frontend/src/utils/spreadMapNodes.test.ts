import assert from 'node:assert/strict';
import { countOverlappingNodes, spreadMapNodes } from './spreadMapNodes';
import type { ItineraryNode } from '../types/itinerary';

function node(
  partial: Pick<ItineraryNode, 'id' | 'name' | 'lat' | 'lng'> & Partial<ItineraryNode>,
): ItineraryNode {
  return {
    category: 'hotel',
    region: 'Bugis',
    is_optional: false,
    ...partial,
  };
}

const HOTEL = 'ibis budget Singapore Bugis';
const LAT = 1.2985;
const LNG = 103.8552;

function testSamePlaceHotelKeepsTrueCoords() {
  const morning = node({ id: 'd2-h-mo', name: HOTEL, lat: LAT, lng: LNG, category: 'hotel' });
  const evening = node({ id: 'd2-h-ev', name: HOTEL, lat: LAT, lng: LNG, category: 'hotel' });
  const out = spreadMapNodes([morning, evening]);
  assert.equal(out.length, 2);
  for (const n of out) {
    assert.equal(n.displayLat, LAT);
    assert.equal(n.displayLng, LNG);
    assert.equal(n.overlapCount, 1);
  }
  assert.equal(countOverlappingNodes([morning, evening]), 0);
}

function testDistinctPlacesStillSpread() {
  const a = node({ id: 'a', name: 'Place A', lat: LAT, lng: LNG, category: 'attraction' });
  const b = node({ id: 'b', name: 'Place B', lat: LAT + 0.0002, lng: LNG, category: 'restaurant' });
  const out = spreadMapNodes([a, b]);
  assert.equal(out.length, 2);
  assert.ok(out.every((n) => n.overlapCount === 2));
  const [p0, p1] = out;
  assert.ok(
    Math.hypot(p0!.displayLat - p1!.displayLat, p0!.displayLng - p1!.displayLng) > 0.001,
  );
  assert.equal(countOverlappingNodes([a, b]), 2);
}

testSamePlaceHotelKeepsTrueCoords();
testDistinctPlacesStillSpread();
console.log('spreadMapNodes.test.ts: ok');
