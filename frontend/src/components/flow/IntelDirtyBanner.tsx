import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import { isIntelDirty } from '../../utils/intelFingerprint';
import './IntelDirtyBanner.css';

/** FLOW-02: 改机酒后不自动重跑；提示用户选择 optimize / regenerate */
export function IntelDirtyBanner() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const plan = usePlanStore((s) => s.getActivePlan());
  const generateItinerary = usePlanStore((s) => s.generateItinerary);
  const isGenerating = usePlanStore((s) => s.isGeneratingItinerary);

  if (!itinerary) return null;
  const dirty = isIntelDirty(plan.travel_intel, itinerary.meta?.intel_snapshot);
  if (!dirty) return null;

  return (
    <div className="intel-dirty-banner" role="status">
      <p className="intel-dirty-banner__text">
        机酒已变，日程可能冲突。不会自动重排——请选择：
      </p>
      <div className="intel-dirty-banner__actions">
        <button
          type="button"
          className="intel-dirty-banner__btn"
          disabled={isGenerating}
          onClick={() => void generateItinerary('optimize')}
        >
          优化适配
        </button>
        <button
          type="button"
          className="intel-dirty-banner__btn intel-dirty-banner__btn--primary"
          disabled={isGenerating}
          onClick={() => void generateItinerary('regenerate')}
        >
          按新机酒重构
        </button>
      </div>
    </div>
  );
}
