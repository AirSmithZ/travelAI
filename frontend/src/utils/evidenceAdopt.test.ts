/** doc 34 L3 — adopt levels payload */
import assert from 'node:assert/strict';
import {
  buildAdoptedUserEvidence,
  defaultAdoptSeed,
  moduleHasAdopt,
  resolveAdoptLevel,
} from './evidenceAdopt.ts';
import type { EvidenceLinkModule } from '../types/travelPlan';

const baseMod = {
  id: 'm1',
  url: 'https://example.com/n',
  status: 'ok' as const,
  result: {
    title: '笔记',
    url: 'https://example.com/n',
    snippet: '正文很长',
    verified: true,
    poi_hits: ['滨海湾花园', '鱼尾狮'],
  },
};

function testSeedDefaultsNice() {
  const seed = defaultAdoptSeed(baseMod.result!);
  assert.deepEqual(seed.adoptedPois, ['滨海湾花园', '鱼尾狮']);
  assert.equal(seed.adoptLevels['滨海湾花园'], 'nice');
  assert.equal(seed.adoptRhythm, false);
  console.log('seedDefaultsNice OK');
}

function testPayloadMustNice() {
  const mod: EvidenceLinkModule = {
    ...baseMod,
    candidatePois: ['滨海湾花园', '鱼尾狮'],
    adoptedPois: ['滨海湾花园', '鱼尾狮'],
    adoptLevels: { 滨海湾花园: 'must', 鱼尾狮: 'nice' },
    adoptRhythm: false,
  };
  assert.equal(moduleHasAdopt(mod), true);
  assert.equal(resolveAdoptLevel(mod, '滨海湾花园'), 'must');
  const payload = buildAdoptedUserEvidence([mod]);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].adopt_levels?.['滨海湾花园'], 'must');
  assert.ok(payload[0].snippet?.includes('必去'));
  assert.ok(payload[0].snippet?.includes('想去'));
  console.log('payloadMustNice OK');
}

testSeedDefaultsNice();
testPayloadMustNice();
console.log('all evidenceAdopt tests OK');
