import type { TravelPlan } from '../types/travelPlan';
import type { LeftPanelMode } from '../stores/usePlanStore';
import { ANZ_PLAN_ID, createAnzPlan } from '../data/anzPlan';
import { migrateItineraryCrossDayEdges } from './itineraryMigrate';
import { normalizeFormPatch } from './patchSchema';
import { createEmptyTravelIntel } from '../types/travelIntel';

const STORAGE_KEY = 'travel_plans_v1';
const STORAGE_VERSION = 3;

interface StoragePayloadV1 {
  version: 1;
  active_plan_id: string;
  plans: TravelPlan[];
}

export interface StoragePayload {
  version: typeof STORAGE_VERSION;
  active_plan_id: string;
  plans: TravelPlan[];
  left_panel_mode?: LeftPanelMode;
}

function migratePlan(plan: TravelPlan): TravelPlan {
  return {
    ...plan,
    travel_intel: plan.travel_intel ?? createEmptyTravelIntel(),
    pending_patches: (plan.pending_patches ?? []).map((p) =>
      normalizeFormPatch(p as Parameters<typeof normalizeFormPatch>[0]),
    ),
    itinerary: plan.itinerary ? migrateItineraryCrossDayEdges(plan.itinerary) : null,
  };
}

export function loadPlansFromStorage(): StoragePayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoragePayloadV1 | StoragePayload;
    if (!Array.isArray(data.plans)) return null;

    const plans = data.plans.map((p) => migratePlan(p as TravelPlan));
    const activeId = plans.some((p) => p.id === data.active_plan_id)
      ? data.active_plan_id
      : plans[0]?.id;

    if (!activeId || plans.length === 0) return null;

    const leftPanelMode =
      'left_panel_mode' in data &&
      (data.left_panel_mode === 'chat' ||
        data.left_panel_mode === 'form' ||
        data.left_panel_mode === 'flight' ||
        data.left_panel_mode === 'stay' ||
        data.left_panel_mode === 'evidence')
        ? data.left_panel_mode
        : undefined;

    return {
      version: STORAGE_VERSION,
      active_plan_id: activeId,
      plans,
      ...(leftPanelMode ? { left_panel_mode: leftPanelMode } : {}),
    };
  } catch {
    return null;
  }
}

export function savePlansToStorage(payload: StoragePayload): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...payload, version: STORAGE_VERSION }),
  );
}

function planIsBlank(plan: TravelPlan | undefined): boolean {
  if (!plan) return true;
  return (plan.itinerary?.days.length ?? 0) === 0 && !plan.trip_request.destination.trim();
}

/** 把整理好的澳新行程放进计划列表。已有同版行程时不覆盖，避免冲掉图上拖过的位置。 */
function withAnzPlan(plans: TravelPlan[], activePlanId: string): {
  plans: TravelPlan[];
  activePlanId: string;
} {
  const seed = createAnzPlan();
  const model = seed.itinerary?.meta.model;
  const index = plans.findIndex((plan) => plan.id === ANZ_PLAN_ID);
  let next = plans;
  if (index < 0) {
    next = [seed, ...plans];
  } else if (plans[index].itinerary?.meta.model !== model) {
    const existing = plans[index];
    next = plans.slice();
    next[index] = {
      ...seed,
      created_at: existing.created_at,
      chat_messages: existing.chat_messages,
    };
  }
  const active = next.find((plan) => plan.id === activePlanId);
  return {
    plans: next,
    activePlanId: planIsBlank(active) ? ANZ_PLAN_ID : activePlanId,
  };
}

export function getInitialState(): {
  plans: TravelPlan[];
  activePlanId: string;
  leftPanelMode: LeftPanelMode;
} {
  const stored = loadPlansFromStorage();
  if (stored && stored.plans.length > 0) {
    const merged = withAnzPlan(stored.plans, stored.active_plan_id);
    return {
      plans: merged.plans,
      activePlanId: merged.activePlanId,
      leftPanelMode: stored.left_panel_mode ?? 'chat',
    };
  }
  const plan = createAnzPlan();
  return { plans: [plan], activePlanId: plan.id, leftPanelMode: 'chat' };
}
