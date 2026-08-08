import type { FormPatch } from '../types/travelPlan';

const LOW_RISK_FIELDS = new Set(['preference_tags', 'free_text']);

/**
 * UX-CHAT-03: whitelist auto-apply patches (confidence ≠ low).
 * destination / dates / day_count / fork / itinerary always require confirm.
 */
export function isLowRiskAutoPatch(patch: FormPatch): boolean {
  if (patch.confidence === 'low') return false;
  if (patch.action === 'fork_plan' || patch.action === 'add_node' || patch.action === 'add_day') {
    return false;
  }
  if (patch.action === 'update_edge') return false;
  if (patch.target !== 'trip_request') return false;
  if (!LOW_RISK_FIELDS.has(patch.field_path)) return false;
  if (patch.field_path === 'preference_tags') {
    return patch.action === 'append' || patch.action === 'remove' || patch.action === 'set';
  }
  if (patch.field_path === 'free_text') {
    return patch.action === 'set' || patch.action === 'append';
  }
  return false;
}

export function splitLowRiskPatches(patches: FormPatch[]): {
  auto: FormPatch[];
  confirm: FormPatch[];
} {
  const auto: FormPatch[] = [];
  const confirm: FormPatch[] = [];
  for (const p of patches) {
    if (isLowRiskAutoPatch(p)) auto.push(p);
    else confirm.push(p);
  }
  return { auto, confirm };
}
