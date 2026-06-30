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
