import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  addCalendarDays,
  formatLocalDate,
  parseLocalDate,
  todayLocalDate,
  weekdayFromDate,
} from '../../utils/dateUtils';
import './DateField.css';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
] as const;

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Clamp past `min` values visually and when committing */
  allowClear?: boolean;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-first index 0..6 */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function formatTriggerLabel(iso: string): { primary: string; secondary: string } {
  if (!iso) return { primary: '', secondary: '' };
  const d = parseLocalDate(iso);
  const primary = `${d.getMonth() + 1}月${d.getDate()}日`;
  const secondary = `${d.getFullYear()} · ${weekdayFromDate(iso)}`;
  return { primary, secondary };
}

export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = '选择日期',
  id,
  className = '',
  allowClear = false,
}: DateFieldProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const today = todayLocalDate();
  const minDate = min || undefined;
  const maxDate = max || undefined;

  const [open, setOpen] = useState(false);
  const initialCursor = value ? parseLocalDate(value) : new Date();
  const [cursor, setCursor] = useState(() => startOfMonth(initialCursor));

  useEffect(() => {
    if (value) setCursor(startOfMonth(parseLocalDate(value)));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = mondayIndex(first);
    const start = new Date(first);
    start.setDate(first.getDate() - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = formatLocalDate(d);
      const inMonth = d.getMonth() === cursor.getMonth();
      const disabledDay =
        Boolean(minDate && iso < minDate) || Boolean(maxDate && iso > maxDate);
      return { d, iso, inMonth, disabledDay, isToday: iso === today, selected: Boolean(value && iso === value) };
    });
  }, [cursor, minDate, maxDate, today, value]);

  const label = formatTriggerLabel(value);

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1, 12));
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className={`date-field ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`date-field__trigger${open ? ' is-open' : ''}${value ? '' : ' is-empty'}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="date-field__icon" aria-hidden />
        <span className="date-field__text">
          {value ? (
            <>
              <span className="date-field__primary">{label.primary}</span>
              <span className="date-field__secondary">{label.secondary}</span>
            </>
          ) : (
            <span className="date-field__placeholder">{placeholder}</span>
          )}
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          className="date-field__popover"
          role="dialog"
          aria-label="选择日期"
        >
          <header className="date-field__head">
            <button
              type="button"
              className="date-field__nav"
              aria-label="上个月"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <p className="date-field__month">
              {cursor.getFullYear()}
              <span>{MONTH_LABELS[cursor.getMonth()]}</span>
            </p>
            <button
              type="button"
              className="date-field__nav"
              aria-label="下个月"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </header>

          <div className="date-field__weeks" aria-hidden>
            {WEEK_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="date-field__grid" role="grid">
            {cells.map((cell) => (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                disabled={cell.disabledDay}
                className={[
                  'date-field__day',
                  cell.inMonth ? '' : 'is-out',
                  cell.isToday ? 'is-today' : '',
                  cell.selected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pick(cell.iso)}
              >
                {cell.d.getDate()}
              </button>
            ))}
          </div>

          <footer className="date-field__foot">
            <button
              type="button"
              className="date-field__foot-btn"
              onClick={() => {
                const t = todayLocalDate();
                if (minDate && t < minDate) pick(minDate);
                else if (maxDate && t > maxDate) pick(maxDate);
                else pick(t);
              }}
            >
              今天
            </button>
            {allowClear && (
              <button
                type="button"
                className="date-field__foot-btn"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                清除
              </button>
            )}
            {!allowClear && value && (
              <button
                type="button"
                className="date-field__foot-btn"
                onClick={() => pick(addCalendarDays(value, 1))}
              >
                次日
              </button>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
