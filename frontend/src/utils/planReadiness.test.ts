import { createEmptyPlan } from './planHelpers';
import { derivePlanReadiness } from './planReadiness';
import { isGenerateIntent } from './generateIntent';
import { isLowRiskAutoPatch, splitLowRiskPatches } from './lowRiskPatches';
import type { FormPatch } from '../types/travelPlan';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const plan = createEmptyPlan();
assert(!derivePlanReadiness(plan).canGenerate, 'empty cannot generate');

plan.trip_request.destination = '新加坡';
plan.trip_request.day_count = 4;
assert(!derivePlanReadiness(plan).canGenerate, 'no flights still blocked');

plan.travel_intel.flights = [
  {
    id: 'f1',
    sequence: 1,
    role: 'outbound',
    origin_iata: 'PVG',
    dest_iata: 'SIN',
    depart_at: '2026-09-01T08:00:00+08:00',
    arrive_at: '2026-09-01T14:00:00+08:00',
    airline: 'SQ',
    stops: 0,
    duration_minutes: 360,
    quote: {} as never,
    quote_id: 'q1',
    booking_status: 'selected',
    is_anchor: true,
  },
];
assert(derivePlanReadiness(plan).canGenerate, 'dest+flight can generate');

assert(isGenerateIntent('帮我生成玩法'), 'generate intent');
assert(isGenerateIntent('排行程'), 'schedule intent');
assert(!isGenerateIntent('生成一张图片'), 'reject image');

const autoPatch: FormPatch = {
  id: '1',
  target: 'trip_request',
  action: 'append',
  field_path: 'preference_tags',
  label: '偏好',
  new_value: '美食',
  summary: '加美食',
  confidence: 'high',
};
const hardPatch: FormPatch = {
  id: '2',
  target: 'trip_request',
  action: 'set',
  field_path: 'destination',
  label: '目的地',
  new_value: '曼谷',
  summary: '改曼谷',
  confidence: 'high',
};
assert(isLowRiskAutoPatch(autoPatch), 'tags auto');
assert(!isLowRiskAutoPatch(hardPatch), 'dest confirm');
const split = splitLowRiskPatches([autoPatch, hardPatch]);
assert(split.auto.length === 1 && split.confirm.length === 1, 'split');

console.log('planReadiness.test.ts ok');
