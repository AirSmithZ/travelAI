import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchAirports, type AirportSearchHit } from '../../api/flights';
import './AirportCombobox.css';

interface AirportComboboxProps {
  /** Committed search value: IATA after pick, or free-typed text. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

const MATCH_HINT: Record<AirportSearchHit['match_type'], string> = {
  country: '国家',
  city: '城市',
  alias: '别名',
  iata: 'IATA',
  name: '机场',
};

function isIataCode(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value.trim());
}

function displayFromHit(hit: AirportSearchHit): string {
  const city = (hit.city_zh || hit.city || '').trim();
  if (city) return `${city}（${hit.iata}）`;
  const name = (hit.name_zh || hit.name || '').trim();
  if (name) return `${name}（${hit.iata}）`;
  return hit.iata;
}

/** Prefer Chinese city text for autocomplete when input shows「吉隆坡（KUL）」. */
function queryForSearch(display: string, lockedIata: string | null): string {
  const text = display.trim();
  if (!text) return '';
  if (lockedIata && text.toUpperCase().includes(lockedIata.toUpperCase())) {
    const cityPart = text.split(/[（(]/)[0]?.trim();
    return cityPart || lockedIata;
  }
  return text;
}

export function AirportCombobox({
  value,
  onChange,
  placeholder = '城市 / 国家 / IATA',
  id,
  disabled,
}: AirportComboboxProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const resolveSeq = useRef(0);
  const [display, setDisplay] = useState(value);
  const [lockedIata, setLockedIata] = useState<string | null>(
    isIataCode(value) ? value.trim().toUpperCase() : null,
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AirportSearchHit[]>([]);
  const [active, setActive] = useState(0);

  // External value → keep IATA committed, resolve Chinese for the input.
  useEffect(() => {
    const next = (value || '').trim();
    if (!next) {
      setDisplay('');
      setLockedIata(null);
      return;
    }
    if (lockedIata && next.toUpperCase() === lockedIata) {
      return;
    }
    if (isIataCode(next)) {
      const iata = next.toUpperCase();
      setLockedIata(iata);
      const seq = ++resolveSeq.current;
      void searchAirports(iata, 5)
        .then((res) => {
          if (seq !== resolveSeq.current) return;
          const hit =
            res.results.find((r) => r.iata.toUpperCase() === iata) ?? res.results[0];
          setDisplay(hit ? displayFromHit(hit) : iata);
        })
        .catch(() => {
          if (seq === resolveSeq.current) setDisplay(iata);
        });
      return;
    }
    setLockedIata(null);
    setDisplay(next);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- lockedIata is local pick state

  useEffect(() => {
    const q = queryForSearch(display, lockedIata);
    if (!open || q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchAirports(q, 14)
        .then((res) => {
          if (cancelled) return;
          setResults(res.results);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [display, open, lockedIata]);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, []);

  function pick(hit: AirportSearchHit) {
    const iata = hit.iata.toUpperCase();
    setLockedIata(iata);
    setDisplay(displayFromHit(hit));
    onChange(iata);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && queryForSearch(display, lockedIata).length > 0;
  const empty = showList && !loading && results.length === 0;

  return (
    <div className="airport-combo" ref={rootRef}>
      <input
        id={id}
        className="form-control airport-combo__input"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && results[active] ? `${listboxId}-${results[active].iata}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const next = e.target.value;
          setDisplay(next);
          setLockedIata(null);
          onChange(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={listboxId}
          className="airport-combo__list"
          role="listbox"
          aria-label="机场搜索结果"
        >
          {loading && <li className="airport-combo__status">搜索中…</li>}
          {empty && (
            <li className="airport-combo__status" role="option" aria-disabled>
              无匹配机场，可试国家名（如马来西亚）或 IATA
            </li>
          )}
          {results.map((hit, idx) => (
            <li
              key={`${hit.iata}-${hit.match_type}`}
              id={`${listboxId}-${hit.iata}`}
              role="option"
              aria-selected={idx === active}
              className={`airport-combo__option${idx === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(hit);
              }}
            >
              <span className="airport-combo__iata">{hit.iata}</span>
              <span className="airport-combo__meta">
                <span className="airport-combo__primary">
                  {(hit.city_zh || hit.city || hit.name_zh || hit.name)
                    + (hit.country_zh || hit.country
                      ? ` · ${hit.country_zh || hit.country}`
                      : '')}
                </span>
                <span className="airport-combo__name">
                  {hit.name_zh || hit.name}
                </span>
              </span>
              <span className={`airport-combo__tag airport-combo__tag--${hit.match_type}`}>
                {MATCH_HINT[hit.match_type]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
