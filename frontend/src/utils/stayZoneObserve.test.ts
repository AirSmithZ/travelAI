/**
 * HOT-ZONE-CATALOG knife2 — observation ring.
 */
import assert from 'node:assert/strict';
import {
  clearStayZoneObserveRing,
  getStayZoneObserveRing,
  observeStayZone,
} from './stayZoneObserve.ts';

clearStayZoneObserveRing();
observeStayZone({ type: 'catalog_load', city: '胡志明市', count: 8 });
observeStayZone({
  type: 'lodging_search',
  zoneId: 'catalog:hcmc:d1',
  city: '胡志明市',
  catalog: true,
  outcome: 'empty_cooldown',
});
const ring = getStayZoneObserveRing();
assert.equal(ring.length, 2);
assert.equal(ring[0]?.e.type, 'catalog_load');
assert.equal(ring[1]?.e.type, 'lodging_search');
clearStayZoneObserveRing();
assert.equal(getStayZoneObserveRing().length, 0);

console.log('stayZoneObserve.test.ts ok');
