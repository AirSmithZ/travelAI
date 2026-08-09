import type { DayPlan } from '../../types/itinerary';
import './DayChips.css';

interface DayChipsProps {
  days: DayPlan[];
  activeIndex: number;
  focusedIndex?: number | null;
  onChange: (index: number) => void;
  onAddDay?: () => void;
}

export function DayChips({ days, activeIndex, focusedIndex, onChange, onAddDay }: DayChipsProps) {
  return (
    <div className="day-chips" role="tablist" aria-label="总览日期导航">
      {days.map((day, index) => {
        const isActive = index === activeIndex;
        const isFocused = focusedIndex === index;
        return (
          <button
            key={`day-chip-${index}-${day.day_index}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`day-chips__item ${isActive ? 'day-chips__item--active' : ''} ${isFocused ? 'day-chips__item--focused' : ''}`}
            onClick={() => onChange(index)}
          >
            D{day.day_index}
          </button>
        );
      })}
      {onAddDay && (
        <button
          type="button"
          className="day-chips__add"
          aria-label="新增一天"
          onClick={onAddDay}
        >
          ＋
        </button>
      )}
    </div>
  );
}
