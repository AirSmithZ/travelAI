import { useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import {
  PLANNING_STRATEGY_OPTIONS,
  resolvePlanningStrategy,
  type PlanningStrategy,
} from '../../types/tripRequest';
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

function strategyNeedsConfirm(plan: {
  travel_intel: { flights: unknown[]; hotels: unknown[] };
  itinerary: { days?: unknown[] } | null;
}): boolean {
  return (
    plan.travel_intel.flights.length > 0 ||
    plan.travel_intel.hotels.length > 0 ||
    Boolean(plan.itinerary?.days?.length)
  );
}

/** UX-CHAT-01 + UX-CHAT-10 + STRAT-UI: readonly progress + strategy + next-step CTA. */
export function PlanSummaryCard({ onPrefill, onRequestGenerate }: PlanSummaryCardProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const updateTripRequest = usePlanStore((s) => s.updateTripRequest);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const [expanded, setExpanded] = useState(true);
  const [pendingStrategy, setPendingStrategy] = useState<PlanningStrategy | null>(null);
  const isGenerating = usePlanStore((s) => s.isGeneratingItinerary);
  const readiness = derivePlanReadiness(plan);
  const nextStep = getPlanningNextStep(plan);
  const strategy = resolvePlanningStrategy(plan.trip_request);
  // P98: 生成中或已有行程时不展示「检查并生成玩法」
  const showNext =
    Boolean(nextStep) &&
    typeof onRequestGenerate === 'function' &&
    !isGenerating &&
    !(plan.itinerary?.days?.length);

  const openPreview = () => {
    const dayCount = plan.itinerary?.days?.length ?? 0;
    // P104: 无玩法行程时摘要不展开地图（片区图仅住宿面板内）
    if (dayCount === 0) return;
    setActiveView('map');
  };

  function applyStrategy(next: PlanningStrategy) {
    updateTripRequest({ planning_strategy: next });
    setPendingStrategy(null);
  }

  function onPickStrategy(next: PlanningStrategy) {
    if (next === strategy) return;
    if (strategyNeedsConfirm(plan)) {
      setPendingStrategy(next);
      return;
    }
    applyStrategy(next);
  }

  const pendingMeta = pendingStrategy
    ? PLANNING_STRATEGY_OPTIONS.find((o) => o.id === pendingStrategy)
    : null;

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
          <div className="plan-summary__strategy" role="group" aria-label="规划策略">
            <span className="plan-summary__strategy-label">规划策略</span>
            <div className="plan-summary__strategy-seg">
              {PLANNING_STRATEGY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`plan-summary__strategy-btn${
                    strategy === opt.id ? ' plan-summary__strategy-btn--active' : ''
                  }`}
                  aria-pressed={strategy === opt.id}
                  title={opt.hint}
                  onClick={() => onPickStrategy(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="plan-summary__strategy-hint">
              {PLANNING_STRATEGY_OPTIONS.find((o) => o.id === strategy)?.hint}
            </p>
          </div>

          {pendingStrategy && pendingMeta ? (
            <div className="plan-summary__strategy-confirm" role="dialog" aria-modal="false">
              <p className="plan-summary__strategy-confirm-title">
                切换为「{pendingMeta.label}」？
              </p>
              <p className="plan-summary__strategy-confirm-body">
                已有机酒或行程时，门禁与下一步会变化；机酒数据保留，玩法不会自动重跑。
              </p>
              <div className="plan-summary__strategy-confirm-actions">
                <button
                  type="button"
                  className="form-btn form-btn--sm form-btn--primary"
                  onClick={() => applyStrategy(pendingStrategy)}
                >
                  确认切换
                </button>
                <button
                  type="button"
                  className="form-btn form-btn--sm"
                  onClick={() => setPendingStrategy(null)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

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
