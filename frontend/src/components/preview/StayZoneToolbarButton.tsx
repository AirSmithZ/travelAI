import { usePlanStore, selectActivePlan } from '../../stores/usePlanStore';
import { getStayZonePanelPhase, stayZonePanelBadgeLabel } from '../../types/stayZone';
import './StayZoneToolbarButton.css';

/** doc 36: stay toolbar remains after generate so map users can reopen search/replace. */
export function StayZoneToolbarButton() {
  const plan = usePlanStore(selectActivePlan);
  const activeView = usePlanStore((s) => s.activeView);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);

  const hasItinerary = Boolean(plan.itinerary?.days.length);
  const phase = getStayZonePanelPhase(plan.travel_intel);
  const hint = stayZonePanelBadgeLabel(phase);
  const detailed = plan.phase === 'detailed';

  if (!hasItinerary || activeView !== 'map') return null;

  return (
    <button
      type="button"
      className="stay-zone-toolbar-btn"
      onClick={() => {
        setLeftPanelMode('stay');
        setActiveView('map');
      }}
      title={
        detailed
          ? '打开住宿面板：搜索或替换酒店'
          : '推荐适合居住的区域并在地图查看'
      }
    >
      {detailed ? '换酒店' : '住宿片区'}
      <span className="stay-zone-toolbar-btn__hint">{hint}</span>
    </button>
  );
}
