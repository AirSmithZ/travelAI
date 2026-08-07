/**
 * FormPatch 工具（前端）：与 backend form_patch_tool 对齐。
 * - 白名单校验 LLM / API 返回的 patch
 * - 用户确认后写入 trip_request / itinerary
 */

import type { Itinerary, NodeCategory, NodeCost, WeatherIcon } from '../types/itinerary';
import type { BudgetLevel, TripRequest } from '../types/tripRequest';
import type { FormPatch, FormPatchAction } from '../types/travelPlan';
import { applyItineraryPatch } from './applyItineraryPatch';

export const TRIP_REQUEST_FIELDS = [
  'free_text',
  'departure',
  'destination',
  'date_start',
  'date_end',
  'day_count',
  'travelers',
  'budget_level',
  'hotel_budget_per_night',
  'preference_tags',
  'notes',
] as const;

export type TripRequestField = (typeof TRIP_REQUEST_FIELDS)[number];

export const NODE_SETTABLE_FIELDS = [
  'name',
  'category',
  'start_time',
  'end_time',
  'is_optional',
  'region',
  'floor',
  'tips',
  'tags',
  'cost_label',
  'cost',
  'scene_group',
  'duration_minutes',
  'address',
] as const;

export const DAY_WEATHER_FIELDS = [
  'temp_min',
  'temp_max',
  'icon',
] as const;

const WEATHER_ICONS = new Set<WeatherIcon>([
  'sunny',
  'cloudy',
  'overcast',
  'rain',
  'storm',
  'snow',
]);

const COST_PER_VALUES = new Set(['person', 'total', 'group']);

const NODE_CATEGORIES = new Set<NodeCategory>([
  'airport',
  'hotel',
  'restaurant',
  'snack',
  'attraction',
  'landmark',
  'transit',
]);

const BUDGET_LEVELS = new Set<BudgetLevel>(['economy', 'comfort', 'luxury']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
const NODE_PATH_RE = /^days\[(\d+)\]\.nodes\[([^\]]+)\](?:\.(.+))?$/;
const WEATHER_PATH_RE = /^days\[(\d+)\]\.weather(?:\.(.+))?$/;

function coerceNodeCost(value: unknown): NodeCost | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const out: NodeCost = {};
  if (raw.amount != null) {
    const n = Number(raw.amount);
    if (Number.isFinite(n)) out.amount = n;
  }
  if (raw.currency != null) {
    const c = coerceString(raw.currency);
    if (c) out.currency = c.toUpperCase();
  }
  if (raw.per != null) {
    const p = String(raw.per).trim();
    if (COST_PER_VALUES.has(p)) out.per = p as NodeCost['per'];
  }
  if (raw.note != null) {
    const note = coerceString(raw.note);
    if (note) out.note = note;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const FIELD_LABELS: Record<TripRequestField, string> = {
  free_text: '行程描述',
  departure: '出发地',
  destination: '目的地',
  date_start: '出发日期',
  date_end: '返程日期',
  day_count: '天数',
  travelers: '人数',
  budget_level: '预算',
  hotel_budget_per_night: '每晚酒店预算',
  preference_tags: '偏好标签',
  notes: '备注',
};

function isTripRequestField(field: string): field is TripRequestField {
  return (TRIP_REQUEST_FIELDS as readonly string[]).includes(field);
}

function coerceString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function coercePositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function coerceTripRequestValue(
  field: TripRequestField,
  action: FormPatchAction,
  value: unknown,
): unknown | null {
  if (action === 'append' || action === 'remove') {
    if (field !== 'preference_tags') return null;
    return coerceString(value);
  }

  if (action !== 'set') return null;

  if (field === 'day_count' || field === 'travelers') {
    return coercePositiveInt(value);
  }

  if (field === 'hotel_budget_per_night') {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  if (field === 'budget_level') {
    const level = String(value).trim().toLowerCase() as BudgetLevel;
    return BUDGET_LEVELS.has(level) ? level : null;
  }

  if (field === 'date_start' || field === 'date_end') {
    const s = coerceString(value);
    return s && DATE_RE.test(s) ? s : null;
  }

  if (field === 'preference_tags') {
    if (!Array.isArray(value)) return null;
    const tags = value.map((v) => coerceString(v)).filter(Boolean) as string[];
    return tags.length > 0 ? tags : null;
  }

  if (field === 'free_text') {
    return value != null ? String(value) : '';
  }

  return coerceString(value);
}

/** 校验并规范化单条 patch；无效返回 null */
export function sanitizeFormPatch(patch: FormPatch): FormPatch | null {
  const action = patch.action;

  if (action === 'fork_plan') {
    const dest = coerceString(patch.fork_plan?.destination ?? patch.new_value);
    if (!dest) return null;
    return {
      ...patch,
      target: 'trip_request',
      field_path: 'destination',
      new_value: dest,
      label: FIELD_LABELS.destination,
      fork_plan: {
        destination: dest,
        inherit_fields: patch.fork_plan?.inherit_fields ?? [
          'preference_tags',
          'travelers',
          'budget_level',
        ],
      },
    };
  }

  if (action === 'add_node' || action === 'update_edge') {
    return patch;
  }

  if (action === 'set' && patch.target === 'node') {
    const m = NODE_PATH_RE.exec(patch.field_path);
    if (!m?.[3]) return null;
    const subField = m[3];
    if (!(NODE_SETTABLE_FIELDS as readonly string[]).includes(subField)) return null;

    if (subField === 'category') {
      const cat = String(patch.new_value).trim().toLowerCase() as NodeCategory;
      if (!NODE_CATEGORIES.has(cat)) return null;
      return { ...patch, new_value: cat };
    }
    if (subField === 'start_time' || subField === 'end_time') {
      const t = coerceString(patch.new_value);
      if (!t || !TIME_RE.test(t)) return null;
      return { ...patch, new_value: t };
    }
    if (subField === 'is_optional') {
      return { ...patch, new_value: Boolean(patch.new_value) };
    }
    if (subField === 'tips' || subField === 'tags') {
      if (!Array.isArray(patch.new_value)) return null;
      const arr = patch.new_value.map((v) => String(v).trim()).filter(Boolean);
      return { ...patch, new_value: arr };
    }
    if (subField === 'cost') {
      const cost = coerceNodeCost(patch.new_value);
      if (!cost) return null;
      return { ...patch, new_value: cost };
    }
    if (subField === 'cost_label') {
      const s = coerceString(patch.new_value);
      return { ...patch, new_value: s ?? '' };
    }
    const s = coerceString(patch.new_value);
    if (!s) return null;
    return { ...patch, new_value: s };
  }

  if (action === 'set' && patch.target === 'day') {
    const m = WEATHER_PATH_RE.exec(patch.field_path);
    if (!m?.[2]) return null;
    const subField = m[2];
    if (!(DAY_WEATHER_FIELDS as readonly string[]).includes(subField)) return null;

    if (subField === 'temp_min' || subField === 'temp_max') {
      const n = Number(patch.new_value);
      if (!Number.isFinite(n)) return null;
      return { ...patch, new_value: Math.round(n) };
    }
    if (subField === 'icon') {
      const icon = String(patch.new_value).trim().toLowerCase() as WeatherIcon;
      if (!WEATHER_ICONS.has(icon)) return null;
      return { ...patch, new_value: icon };
    }
    const s = coerceString(patch.new_value);
    if (!s) return null;
    return { ...patch, new_value: s };
  }

  if (
    patch.target === 'trip_request' &&
    (action === 'set' || action === 'append' || action === 'remove')
  ) {
    if (!isTripRequestField(patch.field_path)) return null;
    const coerced = coerceTripRequestValue(patch.field_path, action, patch.new_value);
    if (coerced === null && action !== 'set') return null;
    if (coerced === null && action === 'set' && patch.field_path !== 'free_text') return null;
    return {
      ...patch,
      label: FIELD_LABELS[patch.field_path] ?? patch.label,
      new_value: coerced ?? '',
    };
  }

  return null;
}

export function sanitizeFormPatches(patches: FormPatch[]): {
  patches: FormPatch[];
  rejected: string[];
} {
  const accepted: FormPatch[] = [];
  const rejected: string[] = [];
  for (const p of patches) {
    const clean = sanitizeFormPatch(p);
    if (clean) accepted.push(clean);
    else rejected.push(p.summary || p.field_path || p.id);
  }
  return { patches: accepted, rejected };
}

export function applyTripRequestPatch(tripRequest: TripRequest, patch: FormPatch): TripRequest {
  const sanitized = sanitizeFormPatch(patch);
  if (!sanitized || sanitized.target !== 'trip_request' || sanitized.action === 'fork_plan') {
    return tripRequest;
  }

  const field = sanitized.field_path as TripRequestField;
  const val = sanitized.new_value;

  if (sanitized.action === 'set') {
    if (field === 'preference_tags' && Array.isArray(val)) {
      return { ...tripRequest, preference_tags: val.map(String) };
    }
    return { ...tripRequest, [field]: val } as TripRequest;
  }

  if (sanitized.action === 'append' && field === 'preference_tags' && typeof val === 'string') {
    if (tripRequest.preference_tags.includes(val)) return tripRequest;
    return { ...tripRequest, preference_tags: [...tripRequest.preference_tags, val] };
  }

  if (sanitized.action === 'remove' && field === 'preference_tags' && typeof val === 'string') {
    return {
      ...tripRequest,
      preference_tags: tripRequest.preference_tags.filter((t) => t !== val),
    };
  }

  return tripRequest;
}

export interface FormPatchApplyResult {
  trip_request: TripRequest;
  itinerary: Itinerary | null;
  appliedIds: string[];
  skipped: { id: string; reason: string }[];
}

/**
 * 用户确认后：按序应用 patch 到表单（trip_request + itinerary）。
 * fork_plan 由 store 单独处理，此处跳过。
 */
export function applyFormPatches(
  tripRequest: TripRequest,
  itinerary: Itinerary | null,
  patches: FormPatch[],
): FormPatchApplyResult {
  let nextTrip = tripRequest;
  let nextItinerary = itinerary;
  const appliedIds: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const raw of patches) {
    if (raw.action === 'fork_plan') continue;

    const patch = sanitizeFormPatch(raw);
    if (!patch) {
      skipped.push({ id: raw.id, reason: '字段不在数据结构白名单内' });
      continue;
    }

    if (
      patch.target === 'trip_request' &&
      (patch.action === 'set' || patch.action === 'append' || patch.action === 'remove')
    ) {
      nextTrip = applyTripRequestPatch(nextTrip, patch);
      appliedIds.push(patch.id);
      continue;
    }

    if (nextItinerary && patch.target !== 'trip_request') {
      nextItinerary = applyItineraryPatch(nextItinerary, patch);
      appliedIds.push(patch.id);
      continue;
    }

    skipped.push({ id: raw.id, reason: '缺少 itinerary 或目标无效' });
  }

  return {
    trip_request: nextTrip,
    itinerary: nextItinerary,
    appliedIds,
    skipped,
  };
}
