import type { CostQuote, QuoteCurrency } from './types';

/**
 * 占比折算沿用行程项目里记下的 2026-10-13 frankfurter.dev 汇率。
 * 油费那一行已经按 3.7575 折成人民币，这里再乘一次就会重复。
 * 三种货币的合计仍然分开，汇率只用来画占比。
 */
export const FX_TO_CNY: Record<QuoteCurrency, number> = {
  CNY: 1,
  AUD: 4.671,
  NZD: 3.7575,
};

export const FX_NOTE = '占比按 2026-10-13 汇率折成人民币，合计仍按人民币、澳元、纽元分开。';

const UNITS: Record<QuoteCurrency, string> = {
  CNY: '元',
  AUD: '澳元',
  NZD: '纽元',
};

const CURRENCY_NAME: Record<QuoteCurrency, string> = {
  CNY: '人民币',
  AUD: '澳元',
  NZD: '纽元',
};

export function currencyName(currency: QuoteCurrency): string {
  return CURRENCY_NAME[currency];
}

export function formatMoney(amount: number | null, currency: QuoteCurrency): string {
  if (amount == null) return '—';
  if (amount === 0) return '免费';
  const text = Number.isInteger(amount)
    ? String(amount)
    : (Math.round(amount * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
  return `${text} ${UNITS[currency]}`;
}

export interface MoneyTotal {
  currency: QuoteCurrency;
  perPerson: number;
  party: number;
}

/** 只加 in_total 且两边都有数字的行。不同货币不相加。 */
export function rollupQuotes(quotes: CostQuote[]): MoneyTotal[] {
  const buckets = new Map<QuoteCurrency, { perPerson: number; party: number }>();
  for (const quote of quotes) {
    if (!quote.in_total || quote.per_person == null || quote.party == null) continue;
    const prev = buckets.get(quote.currency) ?? { perPerson: 0, party: 0 };
    prev.perPerson += quote.per_person;
    prev.party += quote.party;
    buckets.set(quote.currency, prev);
  }
  return [...buckets.entries()].map(([currency, sums]) => ({
    currency,
    perPerson: Math.round(sums.perPerson * 1e6) / 1e6,
    party: Math.round(sums.party * 1e6) / 1e6,
  }));
}

const PARTS = [
  { id: 'flight', label: '机票' },
  { id: 'stay', label: '住宿' },
  { id: 'activity', label: '活动' },
  { id: 'car', label: '租车' },
  { id: 'ground', label: '地面交通' },
  { id: 'fuel', label: '油费' },
  { id: 'other', label: '其他' },
] as const;

export interface ShareSlice {
  id: string;
  label: string;
  percent: number;
  cnyPerPerson: number;
}

function partId(quote: CostQuote): (typeof PARTS)[number]['id'] {
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

export function buildShare(quotes: CostQuote[]): ShareSlice[] {
  const buckets = new Map<string, number>();
  for (const quote of quotes) {
    if (!quote.in_total || quote.per_person == null || quote.per_person === 0) continue;
    const rate = FX_TO_CNY[quote.currency] ?? 1;
    const id = partId(quote);
    buckets.set(id, (buckets.get(id) ?? 0) + quote.per_person * rate);
  }
  const total = [...buckets.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return PARTS.flatMap((part) => {
    const amount = buckets.get(part.id);
    if (!amount) return [];
    return [
      {
        id: part.id,
        label: part.label,
        percent: (amount / total) * 100,
        cnyPerPerson: Math.round(amount * 100) / 100,
      },
    ];
  });
}
