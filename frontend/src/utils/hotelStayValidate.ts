/**
 * B-P6-01: multi-hotel coverage / gap / overlap soft warnings.
 */
import type { ConfirmedHotelStay } from '../types/travelIntel';

export interface HotelStayValidation {
  warnings: string[];
}

function dayMs(isoDate: string): number | null {
  const t = Date.parse(`${isoDate}T00:00:00`);
  return Number.isNaN(t) ? null : t;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = dayMs(checkIn);
  const b = dayMs(checkOut);
  if (a == null || b == null || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive trip nights [dateStart, dateEnd) covered by hotel stays. */
export function validateHotelStays(
  hotels: ConfirmedHotelStay[],
  trip?: { date_start?: string | null; date_end?: string | null },
): HotelStayValidation {
  const warnings: string[] = [];
  if (!hotels.length) return { warnings };

  const start = trip?.date_start?.trim();
  const end = trip?.date_end?.trim();

  for (const h of hotels) {
    if (!h.check_in || !h.check_out) {
      warnings.push(`酒店「${h.name}」缺少入住/离店日期`);
      continue;
    }
    if (nightsBetween(h.check_in, h.check_out) <= 0) {
      warnings.push(`酒店「${h.name}」离店日须晚于入住日`);
    }
    if (start && h.check_in < start) {
      warnings.push(`酒店「${h.name}」入住 ${h.check_in} 早于行程开始 ${start}`);
    }
    if (end && h.check_out > end) {
      warnings.push(`酒店「${h.name}」离店 ${h.check_out} 晚于行程结束 ${end}`);
    }
  }

  // Same-city overlaps
  const byCity = new Map<string, ConfirmedHotelStay[]>();
  for (const h of hotels) {
    const key = (h.city || 'unknown').trim().toLowerCase() || 'unknown';
    const list = byCity.get(key) ?? [];
    list.push(h);
    byCity.set(key, list);
  }
  for (const [city, list] of byCity) {
    const sorted = [...list].sort((a, b) => a.check_in.localeCompare(b.check_in));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (prev.check_out > cur.check_in) {
        warnings.push(
          `${city} 酒店时段重叠：${prev.name}（至 ${prev.check_out}）与 ${cur.name}（自 ${cur.check_in}）`,
        );
      }
    }
  }

  // Trip coverage gaps (simple night walk)
  if (start && end) {
    const covered = new Set<string>();
    for (const h of hotels) {
      const a = dayMs(h.check_in);
      const b = dayMs(h.check_out);
      if (a == null || b == null) continue;
      for (let t = a; t < b; t += 86_400_000) {
        covered.add(new Date(t).toISOString().slice(0, 10));
      }
    }
    const tripStart = dayMs(start);
    const tripEnd = dayMs(end);
    if (tripStart != null && tripEnd != null && tripEnd > tripStart) {
      const gaps: string[] = [];
      for (let t = tripStart; t < tripEnd; t += 86_400_000) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (!covered.has(day)) gaps.push(day);
      }
      if (gaps.length > 0 && gaps.length <= 8) {
        warnings.push(`行程夜间未覆盖住宿：${gaps.join('、')}`);
      } else if (gaps.length > 8) {
        warnings.push(`行程有 ${gaps.length} 晚未覆盖住宿（如 ${gaps.slice(0, 3).join('、')}…）`);
      }
    }
  }

  return { warnings };
}
