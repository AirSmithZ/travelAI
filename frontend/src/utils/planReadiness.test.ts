import { createEmptyPlan } from './planHelpers';
import { derivePlanReadiness, getPlanningNextStep } from './planReadiness';
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
assert(!derivePlanReadiness(plan).canGenerate, 'dest+flight still needs hotel');

plan.travel_intel.hotels = [
  {
    id: 'h1',
    sequence: 1,
    city: '新加坡',
    name: 'Hotel Supreme',
    check_in: '2026-09-01',
    check_out: '2026-09-05',
    is_primary: true,
    is_anchor: true,
    booking_status: 'selected',
    lat: 1.3,
    lng: 103.8,
  },
];
assert(derivePlanReadiness(plan).canGenerate, 'dest+flight+hotel can generate');
assert(getPlanningNextStep(plan)?.kind === 'generate', 'next step generate');
const itineraryItem = derivePlanReadiness(plan).items.find((i) => i.id === 'itinerary');
assert(itineraryItem?.action === 'none', 'no preview until geometry or days');

plan.travel_intel.recommended_stay_zones = [
  {
    id: 'z1',
    sequence: 1,
    city: '新加坡',
    label: '市区',
    check_in: '2026-09-01',
    check_out: '2026-09-05',
    rationale: 'test',
    status: 'confirmed',
    geometry: { type: 'circle', center: { lat: 1.3, lng: 103.8 }, radius_m: 800 },
  },
];
assert(
  derivePlanReadiness(plan).items.find((i) => i.id === 'itinerary')?.action === 'open_preview',
  'zone geometry opens preview',
);

const bare = createEmptyPlan();
bare.trip_request.destination = '新加坡';
assert(getPlanningNextStep(bare)?.action === 'open_flight', 'next step flight');

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
// P71: before itinerary, destination auto-applies; after, needs confirm
assert(isLowRiskAutoPatch(hardPatch, { hasItinerary: false }), 'dest auto pre-itinerary');
assert(!isLowRiskAutoPatch(hardPatch, { hasItinerary: true }), 'dest confirm post-itinerary');
const splitPlanning = splitLowRiskPatches([autoPatch, hardPatch], { hasItinerary: false });
assert(splitPlanning.auto.length === 2 && splitPlanning.confirm.length === 0, 'planning split');
const splitDetailed = splitLowRiskPatches([autoPatch, hardPatch], { hasItinerary: true });
assert(splitDetailed.auto.length === 1 && splitDetailed.confirm.length === 1, 'detailed split');

console.log('planReadiness.test.ts ok');
