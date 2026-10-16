/**
 * HOT-ZONE-CATALOG D — closed stay-zone catalog helpers (+ knife3).
 */
import assert from 'node:assert/strict';
import {
  buildTempMapStayZone,
  catalogEntriesToStayZones,
  getStayZoneCatalogForCity,
  hasStayZoneCatalog,
  mergeCatalogIntoZones,
  orderCatalogByIds,
  rankCatalogEntries,
} from './stayZoneCatalog.ts';

assert.equal(hasStayZoneCatalog('胡志明市'), true);
assert.equal(hasStayZoneCatalog('Ho Chi Minh'), true);
assert.equal(hasStayZoneCatalog('岘港'), true);
assert.equal(hasStayZoneCatalog('Da Nang'), true);
assert.equal(hasStayZoneCatalog('罗托鲁瓦'), false);

const entries = getStayZoneCatalogForCity('西贡');
assert.ok(entries.length >= 6, `expected ≥6 HCMC zones, got ${entries.length}`);
assert.ok(entries.every((e) => e.id.startsWith('catalog:hcmc:')));
assert.ok(entries.every((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)));

const danang = getStayZoneCatalogForCity('岘港');
assert.ok(danang.length >= 6);
assert.ok(danang.every((e) => e.id.startsWith('catalog:danang:')));

const ranked = rankCatalogEntries(entries, ['nightlife']);
assert.equal(ranked[0]?.themes?.includes('nightlife') || ranked[0]?.label.includes('范'), true);

// Knife3: order enforce — drop unknown, append missing
const a = entries[0]!.id;
const b = entries[1]!.id;
const ordered = orderCatalogByIds(entries, ['fake:x', b, a]);
assert.equal(ordered[0]!.id, b);
assert.equal(ordered[1]!.id, a);
assert.equal(ordered.length, entries.length);
assert.ok(!ordered.some((e) => e.id === 'fake:x'));

const zones = catalogEntriesToStayZones(entries, {
  check_in: '2026-09-01',
  check_out: '2026-09-04',
  preferenceTags: ['food'],
  orderedIds: [b, a],
});
assert.equal(zones[0]!.id, b);
assert.ok(zones.every((z) => z.geometry?.type === 'circle'));

const temp = buildTempMapStayZone({
  lat: 10.77,
  lng: 106.7,
  city: '胡志明市',
  check_in: '2026-09-01',
  check_out: '2026-09-04',
});
assert.ok(temp.id.startsWith('temp:map:'));
assert.equal(temp.geometry?.type, 'circle');

const merged = mergeCatalogIntoZones(
  [
    { ...zones[0]!, status: 'confirmed' },
    {
      id: 'llm:old',
      sequence: 99,
      city: '胡志明市',
      label: '旧粗推',
      check_in: '2026-09-01',
      check_out: '2026-09-04',
      rationale: 'x',
      status: 'proposed',
    },
  ],
  zones,
);
assert.ok(merged.some((z) => z.id === zones[0]!.id && z.status === 'confirmed'));
assert.ok(!merged.some((z) => z.id === 'llm:old'));

console.log('stayZoneCatalog.test.ts ok', entries.length, danang.length, ordered[0]?.id);
