import type { DayPlan } from '../../types/itinerary';
import { formatWeatherBrief } from '../../utils/formatWeather';
import './DayTabs.css';

interface DayTabsProps {
  days: DayPlan[];
  activeIndex: number;
  onChange: (index: number) => void;
  onAddDay?: () => void;
}

export function DayTabs({ days, activeIndex, onChange, onAddDay }: DayTabsProps) {
  return (
    <div className="day-tabs" role="tablist">
      {days.map((day, index) => {
        const isActive = index === activeIndex;
        const dateParts = day.date.split('-');
        const shortDate = `${dateParts[1]}/${dateParts[2]}`;

        return (
          <button
            key={day.day_index}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`day-tabs__item ${isActive ? 'day-tabs__item--active' : ''}`}
            onClick={() => onChange(index)}
          >
            <span className="day-tabs__weekday">{day.weekday}</span>
            <span className="day-tabs__date">{shortDate}</span>
            {day.weather && (
              <span className="day-tabs__weather">{formatWeatherBrief(day.weather)}</span>
            )}
          </button>
        );
      })}
      {onAddDay && (
        <button
          type="button"
          className="day-tabs__add"
          aria-label="新增一天"
          onClick={onAddDay}
        >
          ＋
        </button>
      )}
    </div>
  );
}
