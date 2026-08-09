import { useMemo } from 'react';
import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import { BUDGET_LABELS } from '../../types/tripRequest';
import { formatNodeCost } from '../../utils/formatNodeCost';
import './ExpensePanel.css';

interface ExpensePanelProps {
  open: boolean;
  onClose: () => void;
}

/** P77: trip-level expense drawer (budget + node cost rollup). */
export function ExpensePanel({ open, onClose }: ExpensePanelProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const itinerary = usePlanStore(selectActiveItinerary);
  const tr = plan.trip_request;

  const rows = useMemo(() => {
    if (!itinerary?.days?.length) return [];
    const out: { day: number; name: string; cost: string }[] = [];
    for (const day of itinerary.days) {
      for (const node of day.nodes) {
        const cost = formatNodeCost(node);
        if (!cost) continue;
        out.push({ day: day.day_index, name: node.name, cost });
      }
    }
    return out;
  }, [itinerary]);

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
            <p className="expense-panel__sub">预算偏好与行程节点开销汇总（非实时报价）</p>
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

        <section className="expense-panel__section">
          <h3 className="expense-panel__label">节点开销</h3>
          {rows.length === 0 ? (
            <p className="expense-panel__empty">
              {itinerary?.days?.length
                ? '尚未填写节点开销，可在节点编辑中补充。'
                : '生成玩法行程后，此处汇总各点开销。'}
            </p>
          ) : (
            <ul className="expense-panel__list">
              {rows.map((r, i) => (
                <li key={`${r.day}-${r.name}-${i}`}>
                  <span className="expense-panel__day">D{r.day}</span>
                  <span className="expense-panel__name">{r.name}</span>
                  <span className="expense-panel__cost">{r.cost}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
