import { usePlanStore, selectActivePlan } from '../../stores/usePlanStore';
import { getStayZonePanelPhase, stayZonePanelBadgeLabel } from '../../types/stayZone';
import './StayZoneToolbarButton.css';

export function StayZoneToolbarButton() {
  const plan = usePlanStore(selectActivePlan);
  const activeView = usePlanStore((s) => s.activeView);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);

  const hasItinerary = Boolean(plan.itinerary?.days.length);
  const showPhaseB = plan.phase !== 'detailed';
  const phase = getStayZonePanelPhase(plan.travel_intel);
  const hint = stayZonePanelBadgeLabel(phase);

  if (!hasItinerary || activeView !== 'map' || !showPhaseB) return null;

  return (
    <button
      type="button"
      className="stay-zone-toolbar-btn"
      onClick={() => {
        setLeftPanelMode('stay');
        setActiveView('map');
      }}
      title="推荐适合居住的区域并在地图查看"
    >
      住宿片区
      <span className="stay-zone-toolbar-btn__hint">{hint}</span>
    </button>
  );
}
