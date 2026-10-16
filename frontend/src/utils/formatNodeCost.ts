import type { CostQuote, DayPlan, ItineraryNode } from '../types/itinerary';

const CURRENCY_LABELS: Record<string, string> = {
  CNY: '元',
  SGD: '新币',
  USD: '美元',
  EUR: '欧元',
  JPY: '日元',
  HKD: '港币',
};

const PER_LABELS: Record<string, string> = {
  person: '人',
  total: '总计',
  group: '团',
};

export function formatNodeCost(node: Pick<ItineraryNode, 'cost_label' | 'cost'>): string | null {
  if (node.cost_label?.trim()) return node.cost_label.trim();

  const cost = node.cost;
  if (!cost) return null;

  if (cost.amount === 0) return '免费';
  if (cost.note && cost.amount == null) return cost.note;

  const parts: string[] = [];
  if (cost.amount != null) {
    const currency = cost.currency?.toUpperCase() ?? 'CNY';
    const unit = CURRENCY_LABELS[currency] ?? currency;
    parts.push(`${cost.amount} ${unit}`);
  }
  if (cost.per && cost.per !== 'total') {
    parts.push(`/${PER_LABELS[cost.per] ?? cost.per}`);
  }
  if (cost.note) parts.push(`（${cost.note}）`);

  return parts.length > 0 ? parts.join('') : null;
}

const QUOTE_UNITS: Record<CostQuote['currency'], string> = {
  CNY: '元',
  AUD: '澳元',
  NZD: '纽元',
};

export function formatQuoteAmount(amount: number | null, currency: CostQuote['currency']): string {
  if (amount == null) return '—';
  if (amount === 0) return '免费';
  const text = Number.isInteger(amount)
    ? String(amount)
    : (Math.round(amount * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
  return `${text} ${QUOTE_UNITS[currency]}`;
}

/** 只加 in_total 的行。人民币、澳元、纽元分开，不互相折算。 */
export function rollupCostQuotes(quotes: CostQuote[]): Array<{
  currency: CostQuote['currency'];
  perPerson: number;
  party: number;
}> {
  const buckets = new Map<CostQuote['currency'], { perPerson: number; party: number }>();
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

export function sumDayCost(nodes: ItineraryNode[]): number | null {
  let total = 0;
  let hasAmount = false;
  for (const node of nodes) {
    if (node.cost?.amount != null && node.cost.per !== 'group') {
      total += node.cost.amount;
      hasAmount = true;
    }
  }
  return hasAmount ? total : null;
}

export function formatDurationLabel(minutes?: number): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `约 ${minutes} 分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `约 ${h}h${m}m` : `约 ${h}h`;
}

export function formatCommuteDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function sumDayCommuteMinutes(day: DayPlan): number {
  return day.edges
    .filter((e) => e.type === 'primary')
    .reduce((sum, e) => sum + e.duration_minutes, 0);
}
