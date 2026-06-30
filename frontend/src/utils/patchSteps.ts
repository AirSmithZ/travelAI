import type { FormPatch } from '../types/travelPlan';
import type { AddNodePayload, UpdateEdgePayload } from './applyItineraryPatch';

export type PatchStepKind = 'trip_request' | 'itinerary' | 'fork_plan';

export interface PatchStep {
  id: string;
  kind: PatchStepKind;
  title: string;
  patches: FormPatch[];
}

function stepKind(patch: FormPatch): PatchStepKind {
  if (patch.action === 'fork_plan') return 'fork_plan';
  if (patch.target === 'trip_request') return 'trip_request';
  return 'itinerary';
}

const KIND_ORDER: PatchStepKind[] = ['trip_request', 'itinerary', 'fork_plan'];

const KIND_TITLE: Record<PatchStepKind, string> = {
  trip_request: '规划信息',
  itinerary: '行程补充',
  fork_plan: '换目的地',
};

/** 将 pending patches 按模块聚合为确认步骤 */
export function groupPatchesIntoSteps(patches: FormPatch[]): PatchStep[] {
  const buckets = new Map<PatchStepKind, FormPatch[]>();
  for (const p of patches) {
    const k = stepKind(p);
    const list = buckets.get(k) ?? [];
    list.push(p);
    buckets.set(k, list);
  }

  return KIND_ORDER.filter((k) => buckets.has(k)).map((kind) => {
    const group = buckets.get(kind)!;
    const batchId = group[0]?.batch_id;
    return {
      id: batchId ? `${kind}-${batchId}` : kind,
      kind,
      title: KIND_TITLE[kind],
      patches: group,
    };
  });
}

export function formatPatchValue(patch: FormPatch): string {
  if (patch.action === 'fork_plan' && patch.fork_plan) {
    return patch.fork_plan.destination;
  }
  if (patch.action === 'add_node') {
    const payload = patch.new_value as AddNodePayload;
    return `第 ${payload.day_index} 天 · ${payload.node.name}`;
  }
  if (patch.action === 'update_edge') {
    const payload = patch.new_value as UpdateEdgePayload;
    const parts: string[] = [];
    if (payload.patch.transport_mode) parts.push(`交通：${payload.patch.transport_mode}`);
    if (payload.patch.duration_minutes != null) parts.push(`耗时：${payload.patch.duration_minutes} 分钟`);
    if (payload.patch.label) parts.push(payload.patch.label);
    return parts.join(' · ') || payload.edge_id;
  }
  if (typeof patch.new_value === 'object' && patch.new_value !== null) {
    return JSON.stringify(patch.new_value);
  }
  return String(patch.new_value ?? '');
}
