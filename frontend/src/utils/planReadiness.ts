import type { TravelPlan } from '../types/travelPlan';

export type ReadinessAction =
  | 'prefill'
  | 'open_flight'
  | 'open_stay'
  | 'open_evidence'
  | 'generate'
  | 'none';

export interface ReadinessItem {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  hard: boolean;
  soft: boolean;
  /** Composer prefill when user wants to fix via chat */
  hint: string;
  /** Prefill when item is already done («用对话修改») */
  modifyHint: string;
  action: ReadinessAction;
}

export interface PlanReadiness {
  items: ReadinessItem[];
  /** Hard gate aligned with generateItinerary: destination + confirmed flights */
  canGenerate: boolean;
  softWarnings: string[];
  doneCount: number;
  totalCount: number;
}

function hasSchedule(plan: TravelPlan): boolean {
  const tr = plan.trip_request;
  return Boolean(tr.day_count || (tr.date_start && tr.date_end) || tr.date_start || tr.date_end);
}

function hasStay(plan: TravelPlan): boolean {
  const hotels = plan.travel_intel.hotels ?? [];
  const hasHotel = hotels.some((h) => Boolean(h.name?.trim()));
  const hasZone = (plan.travel_intel.recommended_stay_zones ?? []).some(
    (z) => z.status === 'confirmed',
  );
  return hasHotel || hasZone;
}

function hasPreferences(plan: TravelPlan): boolean {
  const tr = plan.trip_request;
  return (
    tr.preference_tags.length > 0 ||
    Boolean(tr.budget_level) ||
    tr.hotel_budget_per_night != null ||
    tr.free_text.trim().length > 10
  );
}

/** Pure readiness derived from plan store truth (UX-CHAT-01/02). */
export function derivePlanReadiness(plan: TravelPlan): PlanReadiness {
  const tr = plan.trip_request;
  const dest = tr.destination.trim();
  const flightCount = plan.travel_intel.flights.length;
  const evidenceItems = plan.itinerary?.meta?.evidence ?? [];
  const evidenceCount = evidenceItems.length;
  const evidenceVerified = evidenceItems.filter((e) => e.verified).length;
  const evidenceStatus = plan.itinerary?.meta?.evidence_status;
  const dayCount = plan.itinerary?.days?.length ?? 0;

  let evidenceDetail = '生成时检索（软提示）';
  if (evidenceCount > 0) {
    evidenceDetail =
      evidenceVerified > 0
        ? `${evidenceCount} 条参考 · ${evidenceVerified} 条含已定位`
        : `${evidenceCount} 条网友提及·未核验（非官方）`;
  } else if (evidenceStatus === 'unconfigured') {
    evidenceDetail = '未配置公开笔记数据源';
  } else if (evidenceStatus === 'empty' || dayCount > 0) {
    evidenceDetail = '本次无印证链接（可查看说明）';
  }

  const items: ReadinessItem[] = [
    {
      id: 'destination',
      label: '目的地',
      detail: dest || '未填写',
      done: Boolean(dest),
      hard: true,
      soft: false,
      hint: '目的地还没定，我想去新加坡',
      modifyHint: '把目的地改成…',
      action: 'prefill',
    },
    {
      id: 'schedule',
      label: '日程',
      detail: tr.day_count
        ? `${tr.day_count} 天`
        : tr.date_start && tr.date_end
          ? `${tr.date_start} → ${tr.date_end}`
          : tr.date_start || tr.date_end || '未填天数/日期',
      done: hasSchedule(plan),
      hard: false,
      soft: true,
      hint: '还缺天数或起止日期，改成 4 天',
      modifyHint: '把行程改成 5 天',
      action: 'prefill',
    },
    {
      id: 'preferences',
      label: '偏好/预算',
      detail:
        tr.preference_tags.length > 0
          ? tr.preference_tags.slice(0, 3).join('、')
          : tr.budget_level || '可选',
      done: hasPreferences(plan),
      hard: false,
      soft: true,
      hint: '偏好美食和亲子，预算舒适',
      modifyHint: '偏好改成美食、轻松',
      action: 'prefill',
    },
    {
      id: 'flights',
      label: '航班',
      detail: flightCount > 0 ? `已确认 ${flightCount} 段` : '未确认',
      done: flightCount > 0,
      hard: true,
      soft: false,
      hint: '请先帮我搜索并确认航班',
      modifyHint: '重新搜索航班',
      action: 'open_flight',
    },
    {
      id: 'stay',
      label: '住宿',
      detail: hasStay(plan) ? '已确认片区或酒店' : '未确认（软门槛）',
      done: hasStay(plan),
      hard: false,
      soft: true,
      hint: '想确认一下住宿片区',
      modifyHint: '换个住宿片区',
      action: 'open_stay',
    },
    {
      id: 'evidence',
      label: '玩法印证',
      detail: evidenceDetail,
      done: evidenceCount > 0,
      hard: false,
      soft: true,
      hint: '印证较弱也可以先生成',
      modifyHint: '查看玩法参考依据',
      action: dayCount > 0 || evidenceCount > 0 ? 'open_evidence' : 'prefill',
    },
    {
      id: 'itinerary',
      label: '行程图',
      detail: dayCount > 0 ? `已有 ${dayCount} 天` : '尚未生成',
      done: dayCount > 0,
      hard: false,
      soft: false,
      hint: '生成玩法',
      modifyHint: '优化适配当前机酒',
      action: dayCount > 0 ? 'none' : 'generate',
    },
  ];

  const softWarnings: string[] = [];
  if (flightCount > 0 && dest && !hasStay(plan)) {
    softWarnings.push('尚未确认酒店或住宿片区；行程住宿区域将为估算');
  }
  if (flightCount > 0 && dest && evidenceCount === 0 && dayCount === 0) {
    softWarnings.push('生成时将检索玩法参考；印证较弱也可继续');
  }

  const canGenerate = Boolean(dest) && flightCount > 0;
  const doneCount = items.filter((i) => i.done).length;

  return {
    items,
    canGenerate,
    softWarnings,
    doneCount,
    totalCount: items.length,
  };
}

export function formatReadinessAssistantText(readiness: PlanReadiness): string {
  const lines = readiness.items.map((item) => {
    const mark = item.done ? '✓' : item.hard ? '✗' : '○';
    return `${mark} ${item.label}：${item.detail}`;
  });
  if (readiness.canGenerate) {
    return `生成前检查：\n${lines.join('\n')}\n\n条件已齐，可点「生成玩法」开始编排。`;
  }
  const missing = readiness.items
    .filter((i) => !i.done && i.hard)
    .map((i) => i.label)
    .join('、');
  return `生成前检查：\n${lines.join('\n')}\n\n还缺：${missing || '关键项'}。补全后再生成。`;
}
