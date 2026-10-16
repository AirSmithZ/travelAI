/** Format overview / trip edge commute labels (TRN-04 / P126). */

import { TRANSPORT_ICONS } from '../data/categoryTokens';
import type { ItineraryEdge, TransportMode } from '../types/itinerary';

const WALK_KMH = 4.5;
const TAXI_KMH = 28.0;

export function formatDistanceMeters(meters: number | undefined | null): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return '';
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km`;
  return `${Math.round(meters)}m`;
}

function estimateMinutes(meters: number, kmh: number): number {
  return Math.max(1, Math.round((meters / 1000 / kmh) * 60));
}

/** Primary chip text: distance + duration when available. */
export function formatCommuteEdgeLabel(edge: ItineraryEdge): string {
  const dist = formatDistanceMeters(edge.distance_meters);
  const mins = edge.duration_minutes;
  const mode = edge.transport_mode;
  const est =
    edge.route_source === 'estimate' || (!edge.route_source && !edge.distance_meters);

  if (dist && mins != null) {
    const suffix = est && mode === 'walk' ? '估' : '';
    return `${dist} · ${mins}′${suffix}`;
  }
  if (dist) return dist;
  if (mins != null) return `${mins} 分钟`;
  return edge.label?.trim() || '通勤';
}

/**
 * 展开排列时连线上的文字。
 * 有距离且时长大于 0 时仍用短标签；时长为 0 时改用边的说明，避免画出「0 分钟」。
 */
export function formatSpreadEdgeLabel(edge: ItineraryEdge): string {
  const label = edge.label?.trim() ?? '';
  const mins = edge.duration_minutes;
  const hasDuration = mins != null && mins > 0;
  const dist = formatDistanceMeters(edge.distance_meters);
  if (dist && hasDuration) return formatCommuteEdgeLabel(edge);
  if (label) return label;
  if (hasDuration) return formatCommuteEdgeLabel(edge);
  return '通勤';
}

/** 图标 + 展开文案，与 OverviewBezierEdge 画出的字符串一致。 */
export function spreadEdgeCaption(edge: ItineraryEdge): string {
  const icon = TRANSPORT_ICONS[edge.transport_mode];
  return `${icon} ${formatSpreadEdgeLabel(edge)}`;
}

/** 胶囊宽度（不含 120px 上限），供展开排列按文字留缝。 */
export function estimateCommuteChipWidth(text: string): number {
  let width = 16;
  for (const ch of text) {
    width += ch.charCodeAt(0) > 127 ? 9.5 : 5.5;
  }
  return Math.max(52, Math.ceil(width));
}

/** Tooltip: include walk/taxi estimates from distance when useful. */
export function formatCommuteEdgeTitle(edge: ItineraryEdge): string {
  const parts: string[] = [];
  if (edge.label?.trim()) parts.push(edge.label.trim());
  const distM = edge.distance_meters;
  const dist = formatDistanceMeters(distM);
  if (dist) {
    const src =
      edge.route_source === 'directions'
        ? '路网'
        : edge.route_source === 'user_hint'
          ? '提示'
          : '直线估';
    parts.push(`${dist}（${src}）`);
  }
  if (edge.duration_minutes != null) {
    parts.push(`${modeLabel(edge.transport_mode)} ${edge.duration_minutes}′`);
  }
  if (distM != null && distM > 0 && edge.transport_mode !== 'flight') {
    const walk = estimateMinutes(distM, WALK_KMH);
    const taxi = estimateMinutes(distM, TAXI_KMH);
    if (edge.transport_mode !== 'walk') parts.push(`步行约 ${walk}′`);
    if (edge.transport_mode !== 'taxi') parts.push(`打车约 ${taxi}′`);
  }
  return parts.join(' · ') || formatCommuteEdgeLabel(edge);
}

function modeLabel(mode: TransportMode): string {
  switch (mode) {
    case 'walk':
      return '步行';
    case 'taxi':
      return '打车';
    case 'subway':
      return '地铁';
    case 'bus':
      return '公交';
    case 'ferry':
      return '轮渡';
    case 'flight':
      return '航班';
    default:
      return '通勤';
  }
}

/** Purchase / booking link label for flight quotes (B-FLT-09). */
export function flightPurchaseLinkLabel(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('trip.com') || host.includes('ctrip.com')) return 'Trip.com 预订';
    if (host.includes('ch.com') || host.includes('spring')) return '春秋航空预订';
    if (host.includes('airline') || host.includes('air.')) return '航司预订';
    return '去购买';
  } catch {
    return '去购买';
  }
}
