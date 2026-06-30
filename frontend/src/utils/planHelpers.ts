import type { DayPlan, Itinerary } from '../types/itinerary';
import type { PlanPhase, TravelPlan } from '../types/travelPlan';
import type { TripRequest } from '../types/tripRequest';
import { createEmptyTripRequest } from '../types/tripRequest';
import { DEFAULT_FORM_LAYOUT } from './formLayout';
import { ensureItineraryNodeRegions } from './nodeRegion';

export { applyTripRequestPatch } from './formPatchTool';

export function planTitleFromRequest(tripRequest: TripRequest): string | null {
  const dest = tripRequest.destination.trim();
  if (!dest) return null;
  const days = tripRequest.day_count;
  return days ? `${dest} ${days} 日游（草案）` : `${dest} 行程（草案）`;
}

export function derivePhase(tripRequest: TripRequest, itinerary: Itinerary | null): PlanPhase {
  if (itinerary && itinerary.days.length > 0) return 'detailed';
  const hasRequest =
    Boolean(tripRequest.destination.trim()) ||
    Boolean(tripRequest.free_text.trim()) ||
    Boolean(tripRequest.day_count) ||
    tripRequest.preference_tags.length > 0;
  return hasRequest ? 'planning' : 'empty';
}

export function createEmptyPlan(title = '新旅行计划'): TravelPlan {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    created_at: now,
    updated_at: now,
    phase: 'empty',
    trip_request: createEmptyTripRequest(),
    itinerary: null,
    chat_messages: [],
    pending_patches: [],
    form_layout: DEFAULT_FORM_LAYOUT,
  };
}

export function syncItineraryMeta(itinerary: Itinerary, tripRequest: TripRequest): Itinerary {
  const dest = tripRequest.destination.trim() || itinerary.destination;
  const dayCount = tripRequest.day_count;
  const title =
    tripRequest.destination.trim()
      ? `${tripRequest.destination.trim()}${dayCount ? ` ${dayCount} 日游` : ' 行程'}`
      : itinerary.title;

  return ensureItineraryNodeRegions({
    ...itinerary,
    destination: dest,
    title,
  });
}

export function touchPlan(plan: TravelPlan): TravelPlan {
  const phase = derivePhase(plan.trip_request, plan.itinerary);
  return { ...plan, phase, updated_at: new Date().toISOString() };
}

/** global 模式确认 patch 后是否具备生成行程图的最低条件 */
export function shouldAutoGenerateItinerary(plan: TravelPlan): boolean {
  if (plan.itinerary || plan.phase === 'detailed') return false;
  const tr = plan.trip_request;
  if (!tr.destination.trim()) return false;
  return Boolean(
    tr.day_count ||
      tr.date_start ||
      tr.date_end ||
      tr.travelers ||
      tr.preference_tags.length > 0 ||
      tr.free_text.trim().length > 10,
  );
}

/** 从 itinerary.days 同步 trip_request 的日期与天数 */
export function tripRequestDatesPatch(days: DayPlan[]): Partial<TripRequest> {
  if (days.length === 0) return { day_count: 0 };
  return {
    day_count: days.length,
    date_start: days[0]?.date,
    date_end: days[days.length - 1]?.date,
  };
}
