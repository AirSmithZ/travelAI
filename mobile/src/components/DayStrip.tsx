import { useEffect, useRef } from 'react';
import type { DayPlan } from '../types';

interface DayStripProps {
  days: DayPlan[];
  dayIndex: number;
  locked: boolean;
  onPick: (index: number) => void;
}

export function DayStrip({ days, dayIndex, locked, onPick }: DayStripProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scroller.current;
    const current = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !current) return;
    const left = current.offsetLeft - box.clientWidth / 2 + current.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [dayIndex]);

  return (
    <div className="day-strip" ref={scroller} role="tablist" aria-label="日期">
      {days.map((day, index) => {
        const on = index === dayIndex;
        return (
          <button
            key={day.date}
            type="button"
            role="tab"
            className={`day-chip${on ? ' is-on' : ''}`}
            aria-selected={on}
            disabled={locked && !on}
            onClick={() => onPick(index)}
          >
            <b>D{day.day_index}</b>
            <span>{day.date.slice(5)}</span>
            <small>{day.region || day.weekday}</small>
          </button>
        );
      })}
      <span className="scroll-pad scroll-pad--x" aria-hidden="true" />
    </div>
  );
}
