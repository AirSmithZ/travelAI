/**
 * TRN-02b: after edge duration changes, re-pack same-day node clocks
 * using primary edge gaps (simplified client mirror of align_day_schedules).
 */
import type { DayPlan, ItineraryNode } from '../types/itinerary';

const GAP_MIN = 15;
const MIN_NODE_DUR = 20;

function parseHhmm(value?: string): number | null {
  if (!value || !value.includes(':')) return null;
  const [hs, ms] = value.split(':');
  const h = Number(hs);
  const m = Number((ms ?? '').slice(0, 2));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

function formatHhmm(minutes: number): string {
  const m = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isEveningHotel(node: ItineraryNode): boolean {
  if (node.category !== 'hotel') return false;
  const tips = (node.tips ?? []).join(' ');
  if (tips.includes('过夜')) return true;
  const st = parseHhmm(node.start_time);
  return st != null && st >= 18 * 60;
}

function nodeDuration(node: ItineraryNode): number {
  const st = parseHhmm(node.start_time);
  const en = parseHhmm(node.end_time);
  if (st != null && en != null) {
    if (en >= st) return Math.max(MIN_NODE_DUR, en - st);
    return Math.max(MIN_NODE_DUR, en + 24 * 60 - st);
  }
  if (node.duration_minutes != null && node.duration_minutes > 0) {
    return Math.max(MIN_NODE_DUR, node.duration_minutes);
  }
  return 60;
}

function gapBefore(day: DayPlan, toId: string): number {
  for (const e of day.edges) {
    if ((e.type ?? 'primary') === 'primary' && e.to === toId) {
      return Math.max(GAP_MIN, e.duration_minutes ?? GAP_MIN);
    }
  }
  return GAP_MIN;
}

/** Return a new day with flexible nodes re-packed from edge gaps. */
export function cascadeDayScheduleFromEdges(day: DayPlan): DayPlan {
  const nodes = day.nodes.map((n) => ({ ...n }));
  if (nodes.length < 2) return { ...day, nodes };

  let cursor = parseHhmm(nodes[0].end_time);
  if (cursor == null) {
    const st = parseHhmm(nodes[0].start_time) ?? 9 * 60;
    const dur = nodeDuration(nodes[0]);
    nodes[0] = {
      ...nodes[0],
      start_time: formatHhmm(st),
      end_time: formatHhmm(st + dur),
    };
    cursor = st + dur;
  }

  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    const gap = gapBefore({ ...day, nodes }, n.id);

    if (isEveningHotel(n) || n.category === 'airport') {
      if (isEveningHotel(n)) break;
      const en = parseHhmm(n.end_time);
      const st = parseHhmm(n.start_time);
      cursor = en ?? (st != null ? st + nodeDuration(n) : cursor);
      continue;
    }

    const startM = cursor + gap;
    const dur = nodeDuration(n);
    const endM = startM + dur;
    nodes[i] = {
      ...n,
      start_time: formatHhmm(startM),
      end_time: formatHhmm(endM),
      duration_minutes: dur,
    };
    cursor = endM;
  }

  return { ...day, nodes };
}
