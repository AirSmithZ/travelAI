/** FLOW-MC-ORDER climate layer: city×month tips (WARN only · never auto-reorder). */

import type { TripRequest } from '../types/tripRequest';
import { deriveSegments, type SegmentOrderIssue } from './citySegments';

type ClimateRule = {
  match: RegExp;
  /** 1–12 */
  months: number[];
  message: string;
  /** Prefer earlier segment for seaside / this city */
  preferEarlier?: boolean;
};

/** Static coarse climate KB — not daily forecast. */
const CLIMATE_RULES: ClimateRule[] = [
  {
    match: /芽庄|岘港|美奈|富国|nhatrang|danang|phuquoc/i,
    months: [9, 10, 11, 12],
    message: '中南部/沿海城段恰逢雨季偏多：若尚未锁城际票，可考虑海边段排前；已锁航则仅作衣物与室内备选提醒',
    preferEarlier: true,
  },
  {
    match: /芽庄|岘港|美奈|富国|nhatrang|danang|phuquoc/i,
    months: [1, 2, 3, 4],
    message: '沿海城段处于相对旱季窗口，气候上较适合户外与海边',
  },
  {
    match: /胡志明|西贡|河内|sgn|han/i,
    months: [5, 6, 7, 8, 9],
    message: '越南北中/南部雨季午后阵雨常见：段内多留室内机动，不据此自动改城序',
  },
  {
    match: /曼谷|清迈|普吉|bkk|cnx|hkt/i,
    months: [6, 7, 8, 9, 10],
    message: '泰国雨季偏多：户外强度可下调；已确认航班不自动对调城段',
  },
  {
    match: /东京|大阪|京都|北海道|tyo|kix/i,
    months: [6, 7],
    message: '日本梅雨/盛夏湿热：备伞与轻便衣物；赏樱/红叶请用 visit_window 另标',
  },
  {
    match: /东京|大阪|京都|tyo|kix/i,
    months: [3, 4],
    message: '春日赏花窗口临近：若行程主题含樱花，请核对段日期是否落在当地花期（不自动改票）',
  },
];

function monthFromDate(iso?: string | null): number | null {
  const s = (iso || '').trim();
  if (s.length < 7) return null;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

function monthsForSegment(date_start?: string, date_end?: string): number[] {
  const a = monthFromDate(date_start);
  const b = monthFromDate(date_end) ?? a;
  if (a == null) return [];
  if (b == null || b === a) return [a];
  const out: number[] = [];
  let cur = a;
  for (let i = 0; i < 12; i++) {
    out.push(cur);
    if (cur === b) break;
    cur = cur === 12 ? 1 : cur + 1;
  }
  return out;
}

/**
 * Append climate WARN issues for multi-city (or single-city) segment months.
 * Never severity=hard — does not block generate / rewrite tickets.
 */
export function validateClimateHints(tr: TripRequest): SegmentOrderIssue[] {
  const segs = deriveSegments(tr);
  const issues: SegmentOrderIssue[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const months = monthsForSegment(seg.date_start, seg.date_end);
    if (!months.length) continue;
    for (const rule of CLIMATE_RULES) {
      if (!rule.match.test(seg.city)) continue;
      if (!months.some((m) => rule.months.includes(m))) continue;
      const key = `${seg.id}|${rule.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let message = `「${seg.city}」气候提示：${rule.message}`;
      if (rule.preferEarlier && i > 0) {
        message += `（当前排在第 ${i + 1} 段）`;
      }
      issues.push({
        severity: 'warn',
        code: 'climate_season',
        message,
      });
    }
  }

  return issues;
}

/** Optional user must_see windows vs segment dates (soft). */
export function validateVisitWindows(tr: TripRequest): SegmentOrderIssue[] {
  const must = tr.must_see;
  if (!must?.length) return [];
  const segs = deriveSegments(tr);
  const issues: SegmentOrderIssue[] = [];

  for (const m of must) {
    const ws = (m.window_start || '').slice(0, 10);
    const we = (m.window_end || '').slice(0, 10);
    if (!ws || !we) continue;
    const city = (m.city || '').trim();
    const seg = city
      ? segs.find((s) => s.city.includes(city) || city.includes(s.city))
      : segs[0];
    if (!seg) continue;
    const ss = (seg.date_start || '').slice(0, 10);
    const se = (seg.date_end || '').slice(0, 10);
    if (!ss || !se) continue;
    const overlap = ss <= we && se >= ws;
    if (!overlap) {
      issues.push({
        severity: 'warn',
        code: 'visit_window',
        message: `「${m.name}」建议窗口 ${ws}–${we}，与城段「${seg.city}」${ss}–${se} 无交集（不自动改段）`,
      });
    }
  }
  return issues;
}
