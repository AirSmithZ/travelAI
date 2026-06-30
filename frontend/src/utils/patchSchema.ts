import type { FormPatch, FormPatchAction, PatchTarget } from '../types/travelPlan';
import { FIELD_LABELS } from './formPatchTool';

export { FIELD_LABELS, TRIP_REQUEST_FIELDS, sanitizeFormPatches, applyFormPatches } from './formPatchTool';

type LegacyPatch = FormPatch & {
  field?: string;
  value?: unknown;
};

/** 将旧版 field/value patch 规范为设计文档 §3.7 结构 */
export function normalizeFormPatch(raw: LegacyPatch): FormPatch {
  if (raw.target && raw.field_path && raw.new_value !== undefined) {
    return {
      ...raw,
      label: raw.label || (FIELD_LABELS as Record<string, string>)[raw.field_path] || raw.field_path,
    };
  }

  const fieldPath = raw.field_path ?? raw.field ?? '';
  const newValue =
    raw.new_value !== undefined
      ? raw.new_value
      : raw.value !== undefined
        ? raw.value
        : raw.fork_plan?.destination ?? '';

  let target: PatchTarget = raw.target ?? 'trip_request';
  if (raw.action === 'add_node' || raw.action === 'add_day') {
    target = raw.action === 'add_node' ? 'node' : 'day';
  } else if (raw.action === 'update_edge') {
    target = 'edge';
  }

  return {
    id: raw.id,
    target,
    action: raw.action,
    field_path: fieldPath,
    label: raw.label || (FIELD_LABELS as Record<string, string>)[fieldPath] || fieldPath || '修改',
    old_value: raw.old_value,
    new_value: newValue as FormPatch['new_value'],
    summary: raw.summary,
    confidence: raw.confidence,
    fork_plan: raw.fork_plan,
  };
}

export function createTripRequestPatch(
  action: FormPatchAction,
  fieldPath: string,
  newValue: unknown,
  summary: string,
  extra?: Partial<FormPatch>,
): FormPatch {
  return normalizeFormPatch({
    id: crypto.randomUUID(),
    target: 'trip_request',
    action,
    field_path: fieldPath,
    label: (FIELD_LABELS as Record<string, string>)[fieldPath] ?? fieldPath,
    new_value: newValue,
    summary,
    ...extra,
  });
}
