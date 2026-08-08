import { useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import {
  derivePlanReadiness,
  type ReadinessAction,
  type ReadinessItem,
} from '../../utils/planReadiness';
import './PlanSummaryCard.css';

interface PlanSummaryCardProps {
  onPrefill: (text: string) => void;
  onRequestGenerate?: () => void;
}

function handleItemAction(
  item: ReadinessItem,
  opts: {
    onPrefill: (text: string) => void;
    onRequestGenerate?: () => void;
    setLeftPanelMode: (mode: 'flight' | 'stay' | 'evidence' | 'chat' | 'form') => void;
    modify: boolean;
  },
) {
  const action: ReadinessAction = modify ? 'prefill' : item.action;
  const text = modify ? item.modifyHint : item.hint;

  if (action === 'open_flight') {
    opts.setLeftPanelMode('flight');
    return;
  }
  if (action === 'open_stay') {
    opts.setLeftPanelMode('stay');
    return;
  }
  if (action === 'open_evidence') {
    opts.setLeftPanelMode('evidence');
    return;
  }
  if (action === 'generate') {
    opts.onRequestGenerate?.();
    return;
  }
  if (action === 'prefill' || modify) {
    opts.onPrefill(text);
  }
}

/** UX-CHAT-01: readonly plan progress; edits only via chat prefill or panels. */
export function PlanSummaryCard({ onPrefill, onRequestGenerate }: PlanSummaryCardProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const [expanded, setExpanded] = useState(true);
  const readiness = derivePlanReadiness(plan);

  return (
    <section className="plan-summary" aria-label="计划摘要">
      <button
        type="button"
        className="plan-summary__toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="plan-summary__title">计划摘要</span>
        <span className="plan-summary__meta">
          {readiness.doneCount}/{readiness.totalCount}
          {readiness.canGenerate ? ' · 可生成' : ' · 未齐备'}
        </span>
        <span className="plan-summary__chev" aria-hidden>
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {expanded && (
        <ul className="plan-summary__list">
          {readiness.items.map((item) => (
            <li
              key={item.id}
              className={`plan-summary__item${item.done ? ' plan-summary__item--done' : ''}${
                !item.done && item.hard ? ' plan-summary__item--hard' : ''
              }`}
            >
              <button
                type="button"
                className="plan-summary__row"
                onClick={() =>
                  handleItemAction(item, {
                    onPrefill,
                    onRequestGenerate,
                    setLeftPanelMode,
                    modify: false,
                  })
                }
                title={item.done ? item.detail : item.hint}
              >
                <span className="plan-summary__mark" aria-hidden>
                  {item.done ? '✓' : item.hard ? '!' : '○'}
                </span>
                <span className="plan-summary__label">{item.label}</span>
                <span className="plan-summary__detail">{item.detail}</span>
              </button>
              {item.done && item.action !== 'none' && (
                <button
                  type="button"
                  className="plan-summary__chip"
                  onClick={() =>
                    handleItemAction(item, {
                      onPrefill,
                      onRequestGenerate,
                      setLeftPanelMode,
                      modify: true,
                    })
                  }
                >
                  用对话修改
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
