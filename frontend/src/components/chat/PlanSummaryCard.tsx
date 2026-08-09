import { useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import {
  derivePlanReadiness,
  getPlanningNextStep,
  type ReadinessAction,
  type ReadinessItem,
} from '../../utils/planReadiness';
import { PlanningNextStepCard } from './PlanningNextStepCard';
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
    openPreview: () => void;
    /** true = chip「用对话修改」→ 始终预填，不跳面板 */
    modify: boolean;
  },
) {
  // Chip path: never open flight/stay panels — only fill composer
  if (opts.modify) {
    const text = (item.modifyHint || item.hint || '').trim();
    if (text) opts.onPrefill(text);
    return;
  }

  const action: ReadinessAction = item.action;
  // Already-done rows that are chat-editable: prefill modify phrasing
  const text = item.done && action === 'prefill' ? item.modifyHint : item.hint;

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
  if (action === 'open_preview') {
    opts.openPreview();
    return;
  }
  if (action === 'generate') {
    opts.onRequestGenerate?.();
    return;
  }
  if (action === 'prefill') {
    const t = (text || '').trim();
    if (t) opts.onPrefill(t);
  }
}

/** UX-CHAT-01 + UX-CHAT-10: readonly progress (left) + next-step CTA (right). */
export function PlanSummaryCard({ onPrefill, onRequestGenerate }: PlanSummaryCardProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setPreviewExpandedWithoutItinerary = usePlanStore(
    (s) => s.setPreviewExpandedWithoutItinerary,
  );
  const [expanded, setExpanded] = useState(true);
  const readiness = derivePlanReadiness(plan);
  const nextStep = getPlanningNextStep(plan);
  const showNext = Boolean(nextStep) && typeof onRequestGenerate === 'function';

  const openPreview = () => {
    const dayCount = plan.itinerary?.days?.length ?? 0;
    if (dayCount === 0) {
      setPreviewExpandedWithoutItinerary(true);
    }
    setActiveView('map');
  };

  return (
    <section
      className={`plan-summary${showNext ? ' plan-summary--with-next' : ''}`}
      aria-label="计划摘要"
    >
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
        <div
          className={`plan-summary__body${showNext ? ' plan-summary__body--split' : ''}`}
        >
          <ul className="plan-summary__list">
            {readiness.items.map((item) => {
              const inert = item.action === 'none' && !item.done;
              return (
                <li
                  key={item.id}
                  className={`plan-summary__item${item.done ? ' plan-summary__item--done' : ''}${
                    !item.done && item.hard ? ' plan-summary__item--hard' : ''
                  }${inert ? ' plan-summary__item--inert' : ''}`}
                >
                  <button
                    type="button"
                    className="plan-summary__row"
                    disabled={inert}
                    onClick={() =>
                      handleItemAction(item, {
                        onPrefill,
                        onRequestGenerate,
                        setLeftPanelMode,
                        openPreview,
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleItemAction(item, {
                          onPrefill,
                          onRequestGenerate,
                          setLeftPanelMode,
                          openPreview,
                          modify: true,
                        });
                      }}
                    >
                      用对话修改
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {showNext && onRequestGenerate ? (
            <PlanningNextStepCard
              variant="embedded"
              onPrefill={onPrefill}
              onRequestGenerate={onRequestGenerate}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
