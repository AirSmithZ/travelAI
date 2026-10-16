import { useEffect, useMemo, useState } from 'react';
import type { Doc } from '../types';
import { currencyName, formatMoney, rollupQuotes } from '../money';
import { collectQuotes } from '../trip';
import { actions } from '../store';

interface ExpenseBoardProps {
  doc: Doc;
  scope: 'day' | 'all';
  dayIndex: number;
  onOpenNode?: (nodeId: string) => void;
}

export function ExpenseBoard({ doc, scope, dayIndex, onOpenNode }: ExpenseBoardProps) {
  const day = doc.itinerary.days[dayIndex];
  const rows = useMemo(() => collectQuotes(doc, scope === 'day' ? dayIndex : null), [doc, scope, dayIndex]);
  const totals = useMemo(() => rollupQuotes(rows.map((row) => row.quote)), [rows]);
  const [travelers, setTravelers] = useState(String(doc.travelers));

  useEffect(() => {
    setTravelers(String(doc.travelers));
  }, [doc.travelers]);

  return (
    <div className="expense">
      <header className="expense-head">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2>开销</h2>
          <p className="fine">
            {scope === 'day' && day
              ? `D${day.day_index} ${day.date.slice(5)} ${day.region ?? ''}`
              : `全部 ${doc.itinerary.days.length} 天`}
            。各笔记在一起，人民币、澳元、纽元分开加。
          </p>
        </div>
        <label className="field field--inline">
          <span>同行人数</span>
          <input
            inputMode="numeric"
            value={travelers}
            onChange={(event) => setTravelers(event.target.value)}
            onBlur={() => {
              const number = Number(travelers);
              if (Number.isFinite(number) && number >= 1) actions.setTravelers(number);
              else setTravelers(String(doc.travelers));
            }}
          />
        </label>
      </header>

      {totals.length > 0 ? (
        <ul className="totals">
          {totals.map((total) => (
            <li key={total.currency}>
              <span>{currencyName(total.currency)}</span>
              <strong>{formatMoney(total.perPerson, total.currency)}</strong>
              <small>
                {doc.travelers} 人 {formatMoney(total.party, total.currency)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">这一范围里还没有计入合计的数字。</p>
      )}

      <h3 className="ledger-title">明细</h3>
      {rows.length === 0 ? <p className="fine">没有写入数字的费用。</p> : null}
      <ul className="cost-list">
        {rows.map((row) => {
          const body = (
            <>
              <span className="cost-day">{row.day == null ? '全程' : `D${row.day}`}</span>
              <span className="cost-name">
                <b>{row.name}</b>
                {row.quote.item !== row.name ? <small>{row.quote.item}</small> : null}
                {row.quote.note ? <small>{row.quote.note}</small> : null}
                {row.quote.in_total ? null : <small>不计入合计</small>}
              </span>
              <span className="cost-amt">
                <b>{formatMoney(row.quote.per_person, row.quote.currency)}</b>
                <small>{formatMoney(row.quote.party, row.quote.currency)}</small>
              </span>
            </>
          );
          return (
            <li key={row.key} className={row.quote.in_total ? '' : 'is-aside'}>
              {row.nodeId ? (
                <button
                  type="button"
                  onClick={() => {
                    actions.selectNode(row.nodeId);
                    actions.setScope('day');
                    actions.setPanel('graph');
                    onOpenNode?.(row.nodeId!);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div className="cost-static">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="scroll-pad scroll-pad--y" aria-hidden="true" />
    </div>
  );
}
