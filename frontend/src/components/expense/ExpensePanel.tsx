import { useMemo } from 'react';
import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import { BUDGET_LABELS } from '../../types/tripRequest';
import type { CostQuote } from '../../types/itinerary';
import { ExpenseShareRing } from './ExpenseShareRing';
import { buildExpenseShare } from '../../utils/expenseShare';
import { formatNodeCost, formatQuoteAmount, rollupCostQuotes } from '../../utils/formatNodeCost';
import './ExpensePanel.css';

interface ExpensePanelProps {
  open: boolean;
  onClose: () => void;
}

interface ExpenseRow {
  key: string;
  day: number | null;
  name: string;
  quote: CostQuote;
}

/** P77: trip-level expense drawer (budget + node cost rollup). */
export function ExpensePanel({ open, onClose }: ExpensePanelProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const itinerary = usePlanStore(selectActiveItinerary);
  const tr = plan.trip_request;
  const partyLabel = tr.travelers ? `${tr.travelers} 人` : '同行';

  const quoted = useMemo(() => {
    const rows: ExpenseRow[] = [];
    for (const day of itinerary?.days ?? []) {
      for (const node of day.nodes) {
        for (const [index, quote] of (node.cost_quotes ?? []).entries()) {
          rows.push({
            key: `${node.id}-${index}`,
            day: day.day_index,
            name: node.name,
            quote,
          });
        }
      }
    }
    const extras = itinerary?.meta.expense_extras ?? [];
    extras.forEach((quote, index) => {
      rows.push({ key: `extra-${index}`, day: null, name: quote.item, quote });
    });
    return rows;
  }, [itinerary]);

  const totals = useMemo(
    () => rollupCostQuotes(quoted.map((row) => row.quote)),
    [quoted],
  );
  const share = useMemo(
    () => buildExpenseShare(quoted.map((row) => row.quote)),
    [quoted],
  );

  const legacyRows = useMemo(() => {
    if (quoted.length > 0 || !itinerary?.days?.length) return [];
    const out: { day: number; name: string; cost: string }[] = [];
    for (const day of itinerary.days) {
      for (const node of day.nodes) {
        const cost = formatNodeCost(node);
        if (!cost) continue;
        out.push({ day: day.day_index, name: node.name, cost });
      }
    }
    return out;
  }, [itinerary, quoted.length]);

  const hotelBudget =
    tr.hotel_budget_per_night != null
      ? `每晚约 ${tr.hotel_budget_per_night}`
      : null;
  const budgetLabel = tr.budget_level ? BUDGET_LABELS[tr.budget_level] : '未设定';

  if (!open) return null;

  return (
    <div className="expense-panel" role="dialog" aria-label="开销汇总">
      <div className="expense-panel__backdrop" onClick={onClose} aria-hidden />
      <aside className="expense-panel__drawer">
        <header className="expense-panel__head">
          <div>
            <h2 className="expense-panel__title">开销</h2>
            <p className="expense-panel__sub">
              行程文档里的列表价，不是实时报价，也还没付款。人民币和澳元分开，两笔不相加。
            </p>
          </div>
          <button type="button" className="expense-panel__close" onClick={onClose}>
            关闭
          </button>
        </header>

        <section className="expense-panel__section">
          <h3 className="expense-panel__label">行程预算</h3>
          <ul className="expense-panel__budget">
            <li>
              <span>档位</span>
              <strong>{budgetLabel}</strong>
            </li>
            <li>
              <span>酒店预算</span>
              <strong>{hotelBudget || '未设定'}</strong>
            </li>
            <li>
              <span>出行人数</span>
              <strong>{tr.travelers ?? '—'}</strong>
            </li>
          </ul>
          <p className="expense-panel__hint">在对话中说「预算舒适 / 酒店每晚 800」可更新偏好。</p>
        </section>

        {totals.length > 0 && (
          <section className="expense-panel__section">
            <h3 className="expense-panel__label">已计入合计</h3>
            <ul className="expense-panel__budget">
              {totals.map((total) => (
                <li key={total.currency}>
                  <span>{total.currency === 'CNY' ? '人民币' : total.currency === 'AUD' ? '澳元' : '纽元'}</span>
                  <strong>
                    人均 {formatQuoteAmount(total.perPerson, total.currency)}
                    <span className="expense-panel__total-gap"> </span>
                    {partyLabel} {formatQuoteAmount(total.party, total.currency)}
                  </strong>
                </li>
              ))}
            </ul>
            {itinerary?.id === 'anz-2027-02-09' && (
              <p className="expense-panel__hint">
                不含奥兰季两晚、松木改期后的 4 晚和餐饮。租车 3600 纽元、博物馆 22 纽元和油费已折进人民币。澳元地面交通单列。基督城公交 6 纽元、凯恩斯去机场的出租车不在合计里。
              </p>
            )}
          </section>
        )}

        {share.length > 0 && (
          <section className="expense-panel__section">
            <h3 className="expense-panel__label">占比</h3>
            <ExpenseShareRing slices={share} partyLabel={partyLabel} />
          </section>
        )}

        <section className="expense-panel__section expense-panel__section--list">
          <h3 className="expense-panel__label">节点开销</h3>
          {quoted.length > 0 ? (
            <div className="expense-panel__table-wrap">
              <div className="expense-panel__cols" aria-hidden>
                <span />
                <span>项目</span>
                <span>人均</span>
                <span>{partyLabel}</span>
              </div>
              <ul className="expense-panel__list">
                {quoted.map((row) => (
                  <li key={row.key} className={row.quote.in_total ? '' : 'expense-panel__row--aside'}>
                    <span className="expense-panel__day">{row.day == null ? '全程' : `D${row.day}`}</span>
                    <span className="expense-panel__name">
                      {row.name}
                      {row.quote.item !== row.name && (
                        <span className="expense-panel__item">{row.quote.item}</span>
                      )}
                      {row.quote.note && <span className="expense-panel__note">{row.quote.note}</span>}
                    </span>
                    <span className="expense-panel__cost">
                      {formatQuoteAmount(row.quote.per_person, row.quote.currency)}
                    </span>
                    <span className="expense-panel__cost">
                      {formatQuoteAmount(row.quote.party, row.quote.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : legacyRows.length === 0 ? (
            <p className="expense-panel__empty">
              {itinerary?.days?.length
                ? '尚未填写节点开销，可在节点编辑中补充。'
                : '生成玩法行程后，此处汇总各点开销。'}
            </p>
          ) : (
            <ul className="expense-panel__list expense-panel__list--legacy">
              {legacyRows.map((row, index) => (
                <li key={`${row.day}-${row.name}-${index}`}>
                  <span className="expense-panel__day">D{row.day}</span>
                  <span className="expense-panel__name">{row.name}</span>
                  <span className="expense-panel__cost">{row.cost}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
