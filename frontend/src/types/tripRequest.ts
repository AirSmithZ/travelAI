export type BudgetLevel = 'economy' | 'comfort' | 'luxury';

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
}

export function createEmptyTripRequest(): TripRequest {
  return {
    free_text: '',
    destination: '',
    preference_tags: [],
  };
}

export const BUDGET_LABELS: Record<BudgetLevel, string> = {
  economy: '经济',
  comfort: '舒适',
  luxury: '奢华',
};
