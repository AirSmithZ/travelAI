import { usePlanStore } from '../../stores/usePlanStore';
import { getPlanningNextStep } from '../../utils/planReadiness';
import './PlanningNextStepCard.css';

interface PlanningNextStepCardProps {
  onPrefill: (text: string) => void;
  onRequestGenerate: () => void;
  /** Nested in PlanSummaryCard — no outer card chrome */
  variant?: 'standalone' | 'embedded';
}

/** UX-CHAT-10: next-step tip + jump into flight/stay panels (standalone or hub slot). */
export function PlanningNextStepCard({
  onPrefill,
  onRequestGenerate,
  variant = 'standalone',
}: PlanningNextStepCardProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const step = getPlanningNextStep(plan);

  if (!step) return null;

  const handleCta = () => {
    if (step.action === 'open_flight') {
      setLeftPanelMode('flight');
      return;
    }
    if (step.action === 'open_stay') {
      setLeftPanelMode('stay');
      return;
    }
    if (step.action === 'generate') {
      onRequestGenerate();
      return;
    }
    if (step.action === 'prefill') {
      onPrefill('上海出发去新加坡 4 天，偏美食');
    }
  };

  return (
    <aside
      className={`planning-next planning-next--${variant}`}
      aria-label="规划下一步指引"
    >
      <div className="planning-next__text">
        <p className="planning-next__eyebrow">{step.eyebrow}</p>
        <p className="planning-next__title">{step.title}</p>
        <p className="planning-next__body">{step.body}</p>
      </div>
      <button type="button" className="planning-next__cta" onClick={handleCta}>
        {step.ctaLabel}
      </button>
    </aside>
  );
}
