import type { TravelPlan } from '../types/travelPlan';
import { hasLockedHotel } from './hotelDayLoop';

export type ReadinessAction =
  | 'prefill'
  | 'open_flight'
  | 'open_stay'
  | 'open_evidence'
  /** Expand map preview (itinerary route or stay-zone geometry) */
  | 'open_preview'
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
  /** Hard gate: destination + confirmed flights + locked hotel */
  canGenerate: boolean;
  softWarnings: string[];
  doneCount: number;
  totalCount: number;
}

function hasSchedule(plan: TravelPlan): boolean {
  const tr = plan.trip_request;
  return Boolean(tr.day_count || (tr.date_start && tr.date_end) || tr.date_start || tr.date_end);
}

function hasStayZone(plan: TravelPlan): boolean {
  return (plan.travel_intel.recommended_stay_zones ?? []).some(
    (z) => z.status === 'confirmed',
  );
}

function hasStayLocked(plan: TravelPlan): boolean {
  return hasLockedHotel(plan.travel_intel.hotels);
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
  const hasStayGeometry = (plan.travel_intel.recommended_stay_zones ?? []).some((z) =>
    Boolean(z.geometry),
  );

  let evidenceDetail = '生成时检索 · 点此了解用法';
  if (evidenceCount > 0) {
    evidenceDetail =
      evidenceVerified > 0
        ? `${evidenceCount} 条参考 · ${evidenceVerified} 条含已定位`
        : `${evidenceCount} 条网友提及·未核验（非官方）`;
  } else if (evidenceStatus === 'unconfigured') {
    evidenceDetail = '未配置数据源 · 点此查看说明';
  } else if (evidenceStatus === 'empty' || dayCount > 0) {
    evidenceDetail = '本次无印证链接 · 点此查看说明';
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
      detail: flightCount > 0 ? `已确认 ${flightCount} 段 · 点此查看` : '未确认 · 去查价',
      done: flightCount > 0,
      hard: true,
      soft: false,
      hint: '去确认机票：查价与确认航段',
      modifyHint: '重新搜索航班',
      action: 'open_flight',
    },
    {
      id: 'stay',
      label: '住宿',
      detail: hasStayLocked(plan)
        ? '已锁定具体酒店 · 点此查看'
        : hasStayZone(plan)
          ? '已确认片区，待锁定酒店'
          : '未锁定 · 去推荐片区',
      done: hasStayLocked(plan),
      hard: true,
      soft: false,
      hint: '去锁定酒店：确认片区并锁定具体酒店',
      modifyHint: '换一家酒店',
      action: 'open_stay',
    },
    {
      id: 'evidence',
      label: '玩法印证',
      detail: evidenceDetail,
      done: evidenceCount > 0,
      hard: false,
      soft: true,
      hint: '打开玩法印证说明面板',
      modifyHint: '查看玩法印证',
      // P76: 始终可打开说明面板（生成前看用法，生成后看链接）
      action: 'open_evidence',
    },
    {
      id: 'itinerary',
      label: '行程图',
      detail:
        dayCount > 0
          ? `已有 ${dayCount} 天 · 点此预览`
          : hasStayGeometry
            ? '可查看片区地图'
            : '尚未生成 · 生成后可用',
      done: dayCount > 0,
      hard: false,
      soft: false,
      hint:
        dayCount > 0
          ? '打开路线预览'
          : hasStayGeometry
            ? '打开地图查看住宿片区'
            : '生成玩法行程后可预览路线图',
      modifyHint: '优化适配当前机酒',
      // 预览入口收拢到摘要行；生成仍走右栏下一步 / Readiness
      action: dayCount > 0 || hasStayGeometry ? 'open_preview' : 'none',
    },
  ];

  const softWarnings: string[] = [];
  if (flightCount > 0 && dest && hasStayZone(plan) && !hasStayLocked(plan)) {
    softWarnings.push('片区已确认，请再锁定具体酒店后再生成');
  }
  if (flightCount > 0 && dest && evidenceCount === 0 && dayCount === 0) {
    softWarnings.push('生成时将检索玩法参考；印证较弱也可继续');
  }

  const canGenerate = Boolean(dest) && flightCount > 0 && hasStayLocked(plan);
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

export type PlanningNextStepKind = 'destination' | 'flight' | 'stay' | 'generate' | 'none';

export interface PlanningNextStep {
  kind: PlanningNextStepKind;
  /** Short eyebrow, e.g. 下一步 */
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  action: ReadinessAction;
}

/** Sticky chat guide before itinerary exists — what to do next + panel jump. */
export function getPlanningNextStep(plan: TravelPlan): PlanningNextStep | null {
  const dayCount = plan.itinerary?.days?.length ?? 0;
  if (dayCount > 0) return null;

  const readiness = derivePlanReadiness(plan);
  const dest = readiness.items.find((i) => i.id === 'destination');
  const flights = readiness.items.find((i) => i.id === 'flights');
  const stay = readiness.items.find((i) => i.id === 'stay');

  if (!dest?.done) {
    return {
      kind: 'destination',
      eyebrow: '下一步',
      title: '先用对话说清行程',
      body: '例如「上海出发去新加坡 4 天」。目的地写入后，再去确认机票与酒店。',
      ctaLabel: '在输入框继续',
      action: 'prefill',
    };
  }
  if (!flights?.done) {
    return {
      kind: 'flight',
      eyebrow: '下一步',
      title: '确认机票',
      body: '需求已有目的地。请打开机票面板搜索并确认航段——对话里不会自动出票，需要你点一下。',
      ctaLabel: '去确认机票',
      action: 'open_flight',
    };
  }
  if (!stay?.done) {
    return {
      kind: 'stay',
      eyebrow: '下一步',
      title: '锁定酒店',
      body: '航班已确认。请打开住宿面板：确认片区后锁定具体酒店（名称+位置），才能生成玩法。',
      ctaLabel: '去锁定酒店',
      action: 'open_stay',
    };
  }
  if (readiness.canGenerate) {
    return {
      kind: 'generate',
      eyebrow: '可以继续',
      title: '机酒已齐，生成玩法',
      body: '航班与酒店已锁定。点下方按钮检查清单并生成行程（日闭环 + 餐饮会一并编排）。',
      ctaLabel: '检查并生成玩法',
      action: 'generate',
    };
  }
  return null;
}
