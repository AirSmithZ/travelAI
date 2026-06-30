import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './TimePicker.css';

const PANEL_WIDTH = 220;
const PANEL_HEIGHT = 300;

function parseTime(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

interface TimePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = '--:--',
  className = '',
  id,
}: TimePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLUListElement>(null);
  const minuteListRef = useRef<HTMLUListElement>(null);

  const parsed = parseTime(value);
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(parsed?.hour ?? 9);
  const [draftMinute, setDraftMinute] = useState(parsed?.minute ?? 0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const syncDraft = useCallback(() => {
    const next = parseTime(value);
    setDraftHour(next?.hour ?? 9);
    setDraftMinute(next?.minute ?? 0);
  }, [value]);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, PANEL_WIDTH);
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    if (left < 8) left = 8;

    if (top + PANEL_HEIGHT > window.innerHeight - 8) {
      top = rect.top - PANEL_HEIGHT - 6;
    }
    if (top < 8) top = 8;

    setPanelStyle({
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 2000,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    syncDraft();
    updatePanelPosition();
  }, [open, syncDraft, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;

    const scrollSelected = (list: HTMLUListElement | null, selected: number) => {
      const item = list?.querySelector<HTMLElement>(`[data-value="${selected}"]`);
      item?.scrollIntoView({ block: 'center' });
    };

    requestAnimationFrame(() => {
      scrollSelected(hourListRef.current, draftHour);
      scrollSelected(minuteListRef.current, draftMinute);
    });
  }, [open, draftHour, draftMinute]);

  useEffect(() => {
    if (!open) return;

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const display = parsed ? formatTime(parsed.hour, parsed.minute) : placeholder;
  const hasValue = Boolean(parsed);

  const applyDraft = () => {
    onChange(formatTime(draftHour, draftMinute));
    setOpen(false);
  };

  const clearValue = () => {
    onChange(undefined);
    setOpen(false);
  };

  const panel = open ? (
    <div
      ref={panelRef}
      className="time-picker__panel"
      style={panelStyle}
      role="dialog"
      aria-labelledby={fieldId}
    >
      <div className="time-picker__preview">
        <span className="time-picker__preview-num">{String(draftHour).padStart(2, '0')}</span>
        <span className="time-picker__preview-sep">:</span>
        <span className="time-picker__preview-num">{String(draftMinute).padStart(2, '0')}</span>
      </div>

      <div className="time-picker__columns">
        <div className="time-picker__column">
          <span className="time-picker__column-label">时</span>
          <ul ref={hourListRef} className="time-picker__list" aria-label="小时">
            {HOURS.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  data-value={h}
                  className={`time-picker__item${draftHour === h ? ' time-picker__item--active' : ''}`}
                  onClick={() => setDraftHour(h)}
                >
                  {String(h).padStart(2, '0')}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="time-picker__column">
          <span className="time-picker__column-label">分</span>
          <ul ref={minuteListRef} className="time-picker__list" aria-label="分钟">
            {MINUTES.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  data-value={m}
                  className={`time-picker__item${draftMinute === m ? ' time-picker__item--active' : ''}`}
                  onClick={() => setDraftMinute(m)}
                >
                  {String(m).padStart(2, '0')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="time-picker__footer">
        <button
          type="button"
          className="time-picker__action time-picker__action--ghost"
          onClick={clearValue}
        >
          清除
        </button>
        <button
          type="button"
          className="time-picker__action time-picker__action--primary"
          onClick={applyDraft}
        >
          确定
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`time-picker ${open ? 'time-picker--open' : ''} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        id={fieldId}
        className={`time-picker__trigger${hasValue ? '' : ' time-picker__trigger--empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="time-picker__icon"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.25" />
          <path
            d="M7 4.2V7l2 1.2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="time-picker__value">{display}</span>
      </button>

      {panel && createPortal(panel, document.body)}
    </div>
  );
}
