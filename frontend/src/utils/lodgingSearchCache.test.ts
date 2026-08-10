/**
 * P120 lodgingSearchCache — key / TTL / no-empty-write (node, no DOM localStorage).
 */
import assert from 'node:assert/strict';
import {
  formatLodgingCacheAge,
  lodgingPersistCacheKey,
} from './lodgingSearchCache.ts';

const k1 = lodgingPersistCacheKey({
  lat: -38.1354145,
  lng: 176.2534361,
  radiusM: 800,
  city: '罗托鲁瓦',
});
const k2 = lodgingPersistCacheKey({
  lat: -38.1354,
  lng: 176.2534,
  radiusM: 800,
  city: '罗托鲁瓦',
});
assert.equal(k1, k2, 'same hub rounds to same key');

const k3 = lodgingPersistCacheKey({
  lat: -38.1354,
  lng: 176.2534,
  radiusM: 1200,
  city: '罗托鲁瓦',
});
assert.notEqual(k1, k3, 'radius changes key');

// zoneId must not be required — re-recommend still hits
assert.ok(k1.startsWith('v1|'));
assert.ok(!k1.includes('4b734d73'));

const age = formatLodgingCacheAge(Date.now() - 90_000);
assert.ok(age.includes('分钟') || age.includes('s'), age);

console.log('lodgingSearchCache.test.ts ok', k1, age);
