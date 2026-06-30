const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

export function weekdayFromDate(dateStr: string): string {
  return WEEKDAYS[parseLocalDate(dateStr).getDay()];
}

export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

export function nextAvailableDateAfter(existingDates: string[], afterDate: string): string {
  const used = new Set(existingDates.filter(Boolean));
  let cursor = afterDate;
  do {
    cursor = addCalendarDays(cursor, 1);
  } while (used.has(cursor));
  return cursor;
}

/** 数组槽位顺序下，是否存在后一天 date 早于前一天 */
export function isDayDateOrderInconsistent(dates: string[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (prev && curr && curr < prev) return true;
  }
  return false;
}

export function countOtherDaysWithDate(
  dates: string[],
  date: string,
  excludeIndex: number,
): number {
  return dates.filter((d, i) => i !== excludeIndex && d === date).length;
}
