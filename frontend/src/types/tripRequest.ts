export type BudgetLevel = 'economy' | 'comfort' | 'luxury';

/** STRAT-UI · doc 25：规划策略三档 */
export type PlanningStrategy =
  | 'flight_hotel_first'
  | 'interest_then_anchors'
  | 'activity_first';

export const PLANNING_STRATEGY_OPTIONS: {
  id: PlanningStrategy;
  label: string;
  hint: string;
}[] = [
  {
    id: 'flight_hotel_first',
    label: '机酒优先',
    hint: '先定机票与住宿，再排每天玩什么（默认）',
  },
  {
    id: 'interest_then_anchors',
    label: '兴趣前置',
    hint: '先写必去/兴趣，再定片区与机酒',
  },
  {
    id: 'activity_first',
    label: '跟笔记走',
    hint: '以贴链/攻略为骨架；缺校准时暂缓生成',
  },
];

export interface TripRequest {
  free_text: string;
  departure?: string;
  destination: string;
  date_start?: string;
  date_end?: string;
  day_count?: number;
  travelers?: number;
  budget_level?: BudgetLevel;
  /** HOT-03: 每晚酒店预算上限（CNY 等，与 budget_level 并存） */
  hotel_budget_per_night?: number;
  preference_tags: string[];
  notes?: string;
  /** STRAT-UI：默认机酒优先 */
  planning_strategy?: PlanningStrategy;
}

export function createEmptyTripRequest(): TripRequest {
  return {
    free_text: '',
    destination: '',
    preference_tags: [],
    planning_strategy: 'flight_hotel_first',
  };
}

export function resolvePlanningStrategy(tr: TripRequest): PlanningStrategy {
  const s = tr.planning_strategy;
  if (
    s === 'interest_then_anchors' ||
    s === 'activity_first' ||
    s === 'flight_hotel_first'
  ) {
    return s;
  }
  return 'flight_hotel_first';
}

export const BUDGET_LABELS: Record<BudgetLevel, string> = {
  economy: '经济',
  comfort: '舒适',
  luxury: '奢华',
};
