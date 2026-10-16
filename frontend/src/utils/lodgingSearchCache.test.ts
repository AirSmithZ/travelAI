/**
 * P120 / HOT-ZONE-CATALOG lodgingSearchCache — key / TTL / empty short TTL.
 */
import assert from 'node:assert/strict';
import {
  clearLodgingSearchCache,
  formatLodgingCacheAge,
  formatLodgingEmptyCooldown,
  getLodgingEmptyCache,
  getLodgingSearchCache,
  lodgingPersistCacheKey,
  setLodgingEmptyCache,
  setLodgingSearchCache,
  LODGING_EMPTY_TTL_MS,
} from './lodgingSearchCache.ts';

clearLodgingSearchCache();

const k1 = lodgingPersistCacheKey({
  lat: -38.1354145,
  lng: 176.2534361,
  radiusM: 800,
  city: '罗托鲁瓦',
  checkIn: '2026-09-01',
  checkOut: '2026-09-03',
});
const k2 = lodgingPersistCacheKey({
  lat: -38.1354,
  lng: 176.2534,
  radiusM: 800,
  city: '罗托鲁瓦',
  checkIn: '2026-09-01',
  checkOut: '2026-09-03',
});
assert.equal(k1, k2, 'same hub rounds to same key');

const k3 = lodgingPersistCacheKey({
  lat: -38.1354,
  lng: 176.2534,
  radiusM: 1200,
  city: '罗托鲁瓦',
  checkIn: '2026-09-01',
  checkOut: '2026-09-03',
});
assert.notEqual(k1, k3, 'radius changes key');

const k4 = lodgingPersistCacheKey({
  lat: -38.1354,
  lng: 176.2534,
  radiusM: 800,
  city: '罗托鲁瓦',
  checkIn: '2026-09-02',
  checkOut: '2026-09-03',
});
assert.notEqual(k1, k4, 'check-in changes key');

const k5 = lodgingPersistCacheKey({
  lat: 10.7725,
  lng: 106.698,
  radiusM: 1400,
  city: '胡志明市',
  checkIn: '2026-09-01',
  checkOut: '2026-09-04',
  catalogId: 'catalog:hcmc:d1',
});
assert.ok(k5.includes('catalog:hcmc:d1'));

assert.ok(k1.startsWith('v2|'));
assert.ok(!k1.includes('4b734d73'));

const age = formatLodgingCacheAge(Date.now() - 90_000);
assert.ok(age.includes('分钟') || age.includes('s'), age);

// Empty miss: short TTL; must not surface as success hit
setLodgingEmptyCache(k5, { warnings: ['no pins'] });
assert.equal(getLodgingSearchCache(k5), null, 'empty miss ≠ success hit');
const emptyHit = getLodgingEmptyCache(k5);
assert.ok(emptyHit, 'empty cooldown present');
assert.ok(emptyHit!.remainingMs > 0 && emptyHit!.remainingMs <= LODGING_EMPTY_TTL_MS);
assert.equal(emptyHit!.warnings?.[0], 'no pins');
assert.ok(formatLodgingEmptyCooldown(emptyHit!.remainingMs).length > 0);

// Success overwrite clears empty
setLodgingSearchCache(k5, {
  candidates: [
    {
      name: 'Test Hotel',
      lat: 10.77,
      lng: 106.7,
      distance_m: 100,
    },
  ],
});
assert.equal(getLodgingEmptyCache(k5), null, 'success clears empty');
assert.equal(getLodgingSearchCache(k5)?.value.candidates.length, 1);

clearLodgingSearchCache();

console.log('lodgingSearchCache.test.ts ok', k1, age, LODGING_EMPTY_TTL_MS);
