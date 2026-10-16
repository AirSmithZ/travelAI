import type { CostQuote } from '../types/itinerary';

/**
 * 整理稿沿用的 2026-10-13 frankfurter.dev 汇率。
 * 只用于占比折算，不改分货币合计，也不是实时牌价。
 */
export const EXPENSE_FX_TO_CNY: Record<CostQuote['currency'], number> = {
  CNY: 1,
  AUD: 4.671,
  NZD: 3.7575,
};

const PARTS = [
  { id: 'flight', label: '机票' },
  { id: 'stay', label: '住宿' },
  { id: 'activity', label: '活动' },
  { id: 'car', label: '租车' },
  { id: 'ground', label: '地面交通' },
  { id: 'fuel', label: '油费' },
  { id: 'other', label: '其他' },
] as const;

export type ExpensePartId = (typeof PARTS)[number]['id'];

export interface ExpenseShareSlice {
  id: ExpensePartId;
  label: string;
  cnyPerPerson: number;
  cnyParty: number;
  percent: number;
  sources: Array<{ currency: CostQuote['currency']; perPerson: number }>;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** 澳元地面交通先按货币归类，避免公交和房价写在同一站时被算进住宿。 */
export function expensePartId(quote: CostQuote): ExpensePartId {
  if (quote.currency === 'AUD') return 'ground';
  const item = quote.item;
  if (/机票/.test(item)) return 'flight';
  if (/油费/.test(item)) return 'fuel';
  if (/租车/.test(item)) return 'car';
  if (/公寓|旅馆|酒店|\d+\s*晚|Lylo|松木/.test(item)) return 'stay';
  if (/团|套餐|礁|古堡|博物馆|门票|米尔福德|方案/.test(item)) return 'activity';
  if (quote.currency === 'NZD') return 'activity';
  return 'other';
}

/** 已计入合计的行，按部分折成人民币。未定价、已计入别的行的，不进环。 */
export function buildExpenseShare(quotes: CostQuote[]): ExpenseShareSlice[] {
  const buckets = new Map<
    ExpensePartId,
    { cnyPerPerson: number; cnyParty: number; sources: Map<CostQuote['currency'], number> }
  >();

  for (const quote of quotes) {
    if (!quote.in_total || quote.per_person == null || quote.per_person === 0) continue;
    const rate = EXPENSE_FX_TO_CNY[quote.currency] ?? 1;
    const part = expensePartId(quote);
    const bucket = buckets.get(part) ?? {
      cnyPerPerson: 0,
      cnyParty: 0,
      sources: new Map(),
    };
    const party = quote.party ?? quote.per_person;
    bucket.cnyPerPerson += quote.per_person * rate;
    bucket.cnyParty += party * rate;
    bucket.sources.set(quote.currency, (bucket.sources.get(quote.currency) ?? 0) + quote.per_person);
    buckets.set(part, bucket);
  }

  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.cnyPerPerson, 0);
  if (total <= 0) return [];

  return PARTS.flatMap((part) => {
    const bucket = buckets.get(part.id);
    if (!bucket) return [];
    return [
      {
        id: part.id,
        label: part.label,
        cnyPerPerson: roundMoney(bucket.cnyPerPerson),
        cnyParty: roundMoney(bucket.cnyParty),
        percent: (bucket.cnyPerPerson / total) * 100,
        sources: [...bucket.sources.entries()].map(([currency, perPerson]) => ({
          currency,
          perPerson: roundMoney(perPerson),
        })),
      },
    ];
  });
}
