import { useLayoutEffect, useRef, useState } from 'react';
import type { DayPlan } from '../../types/itinerary';
import type { TripRequest } from '../../types/tripRequest';
import type { ConfirmedHotelStay } from '../../types/travelIntel';
import { formatWeatherBrief } from '../../utils/formatWeather';
import { dayPlaceCaption } from '../../utils/dayPlaceCaption';
import './DayTabs.css';

interface DayTabsProps {
  days: DayPlan[];
  activeIndex: number;
  onChange: (index: number) => void;
  onAddDay?: () => void;
  tripRequest?: TripRequest;
  hotels?: ConfirmedHotelStay[] | null;
}

/** 平均每张日期卡至少这么宽，才在全部天上展开当日特色。 */
const HIGHLIGHT_ROOM_PX = 148;

export function DayTabs({
  days,
  activeIndex,
  onChange,
  onAddDay,
  tripRequest,
  hotels,
}: DayTabsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const styles = getComputedStyle(el);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
      const addBtn = el.querySelector<HTMLElement>('.day-tabs__add');
      const addW = addBtn ? addBtn.getBoundingClientRect().width + gap : 0;
      const per = (el.clientWidth - addW) / Math.max(days.length, 1);
      const next = per >= HIGHLIGHT_ROOM_PX;
      setRoomy((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [days]);

  return (
    <div
      ref={rootRef}
      className={`day-tabs${roomy ? ' day-tabs--roomy' : ''}`}
      role="tablist"
      aria-label="行程日期"
    >
      {days.map((day, index) => {
        const isActive = index === activeIndex;
        const dateParts = day.date.split('-');
        const shortDate =
          dateParts.length >= 3 ? `${dateParts[1]}/${dateParts[2]}` : day.date;
        const caption = tripRequest ? dayPlaceCaption(day, tripRequest, hotels) : null;
        const showHighlight = Boolean(caption?.highlight) && (roomy || isActive);
        const accessible = [
          day.weekday,
          shortDate,
          caption?.placeLine,
          caption?.detail || caption?.highlight,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={`day-tab-${index}-${day.day_index}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={accessible}
            title={accessible}
            className={`day-tabs__item ${isActive ? 'day-tabs__item--active' : ''}`}
            onClick={() => onChange(index)}
          >
            <span className="day-tabs__when">
              <span className="day-tabs__date">{shortDate}</span>
              <span className="day-tabs__weekday">{day.weekday}</span>
            </span>
            {caption?.placeLine && (
              <span className="day-tabs__place">
                {caption.country && (
                  <span className="day-tabs__country">{caption.country}</span>
                )}
                {caption.country && caption.city && caption.country !== caption.city && (
                  <span className="day-tabs__dot" aria-hidden>
                    ·
                  </span>
                )}
                {caption.city && caption.city !== caption.country && (
                  <span className="day-tabs__city">{caption.city}</span>
                )}
              </span>
            )}
            {showHighlight && caption?.highlight && (
              <span className="day-tabs__highlight">{caption.highlight}</span>
            )}
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
