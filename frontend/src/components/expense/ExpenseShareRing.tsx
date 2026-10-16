import type { ExpenseShareSlice } from '../../utils/expenseShare';
import { EXPENSE_FX_TO_CNY } from '../../utils/expenseShare';
import { formatQuoteAmount } from '../../utils/formatNodeCost';

const SLICE_COLOR: Record<ExpenseShareSlice['id'], string> = {
  flight: '#f59e0b',
  stay: '#818cf8',
  activity: '#34d399',
  car: '#fb923c',
  ground: '#22d3ee',
  fuel: '#f87171',
  other: '#94a3b8',
};

interface ExpenseShareRingProps {
  slices: ExpenseShareSlice[];
  partyLabel: string;
}

function ringLabel(slices: ExpenseShareSlice[]): string {
  return slices
    .map((slice) => `${slice.label} ${slice.percent.toFixed(1)}%`)
    .join('，');
}

export function ExpenseShareRing({ slices, partyLabel }: ExpenseShareRingProps) {
  const perTotal = Math.round(slices.reduce((sum, slice) => sum + slice.cnyPerPerson, 0) * 100) / 100;
  const partyTotal = Math.round(slices.reduce((sum, slice) => sum + slice.cnyParty, 0) * 100) / 100;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  return (
    <figure className="expense-share">
      <div className="expense-share__body">
        <svg
          className="expense-share__ring"
          viewBox="0 0 140 140"
          role="img"
          aria-label={`开销占比，人均折合 ${perTotal.toFixed(2)} 元。${ringLabel(slices)}`}
        >
          <circle className="expense-share__track" cx="70" cy="70" r={radius} />
          <g transform="rotate(-90 70 70)">
            {slices.map((slice) => {
              const length = (slice.percent / 100) * circumference;
              const gap = length > 4 ? 1.4 : 0;
              const drawn = Math.max(length - gap, 0);
              const dash = `${drawn} ${circumference - drawn}`;
              const offset = cursor;
              cursor += length;
              return (
                <circle
                  key={slice.id}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={SLICE_COLOR[slice.id]}
                  strokeWidth="14"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                >
                  <title>
                    {`${slice.label} ${slice.percent.toFixed(1)}%，人均 ${slice.cnyPerPerson.toFixed(2)} 元`}
                  </title>
                </circle>
              );
            })}
          </g>
          <text className="expense-share__center-label" x="70" y="64" textAnchor="middle">
            人均折合
          </text>
          <text className="expense-share__center-value" x="70" y="82" textAnchor="middle">
            {perTotal.toFixed(0)}
          </text>
        </svg>
        <ul className="expense-share__legend">
          {slices.map((slice) => {
            const foreign = slice.sources.filter((source) => source.currency !== 'CNY');
            return (
              <li key={slice.id}>
                <span className="expense-share__swatch" style={{ background: SLICE_COLOR[slice.id] }} />
                <span className="expense-share__name">{slice.label}</span>
                <span className="expense-share__pct">{slice.percent.toFixed(1)}%</span>
                <span className="expense-share__money">
                  {formatQuoteAmount(slice.cnyPerPerson, 'CNY')}
                  {foreign.map((source) => (
                    <span key={source.currency} className="expense-share__fx">
                      {formatQuoteAmount(source.perPerson, source.currency)} × {EXPENSE_FX_TO_CNY[source.currency]}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption className="expense-panel__hint">
        环图把已计入的澳元、纽元按 2026-10-13 的汇率折成人民币后看份额：1 澳元 = {EXPENSE_FX_TO_CNY.AUD} 元，1 纽元 = {EXPENSE_FX_TO_CNY.NZD} 元。
        {partyLabel}折合约 {partyTotal.toFixed(2)} 元。上面的分货币合计不按这个汇率相加。没写进合计的项目不进环。
      </figcaption>
    </figure>
  );
}
