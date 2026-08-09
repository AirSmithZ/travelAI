import type { FormPatch } from '../types/travelPlan';

/** Always auto-applicable trip_request fields (any phase). */
const ALWAYS_AUTO_FIELDS = new Set(['preference_tags', 'free_text']);

/**
 * Planning-phase auto fields (P71): before itinerary exists, extract → write + Undo.
 * After攻略生成, these require FormPatch confirm (except ALWAYS_AUTO).
 */
const PLANNING_AUTO_FIELDS = new Set([
  'destination',
  'departure',
  'day_count',
  'date_start',
  'date_end',
  'budget_level',
  'hotel_budget_per_night',
  'travelers',
  'preference_tags',
  'free_text',
]);

export type LowRiskOpts = {
  /** true when plan already has itinerary days (攻略已生成) */
  hasItinerary?: boolean;
};

/**
 * UX-CHAT-03 + P71:
 * - No itinerary: auto-apply most trip_request extracts (confidence ≠ low)
 * - Has itinerary: only tags / free_text auto; destination/dates/… need confirm
 * - fork_plan / itinerary mutations always confirm
 */
export function isLowRiskAutoPatch(patch: FormPatch, opts?: LowRiskOpts): boolean {
  if (patch.confidence === 'low') return false;
  if (patch.action === 'fork_plan' || patch.action === 'add_node' || patch.action === 'add_day') {
    return false;
  }
  if (patch.action === 'update_edge') return false;
  if (patch.target !== 'trip_request') return false;

  const field = patch.field_path;
  if (opts?.hasItinerary) {
    if (!ALWAYS_AUTO_FIELDS.has(field)) return false;
  } else if (!PLANNING_AUTO_FIELDS.has(field)) {
    return false;
  }

  if (field === 'preference_tags') {
    return patch.action === 'append' || patch.action === 'remove' || patch.action === 'set';
  }
  if (field === 'free_text') {
    return patch.action === 'set' || patch.action === 'append';
  }
  return patch.action === 'set' || patch.action === 'append';
}

export function splitLowRiskPatches(
  patches: FormPatch[],
  opts?: LowRiskOpts,
): {
  auto: FormPatch[];
  confirm: FormPatch[];
} {
  const auto: FormPatch[] = [];
  const confirm: FormPatch[] = [];
  for (const p of patches) {
    if (isLowRiskAutoPatch(p, opts)) auto.push(p);
    else confirm.push(p);
  }
  return { auto, confirm };
}
