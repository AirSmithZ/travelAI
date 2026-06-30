import type { ViewTab } from '../../types/itinerary';
import './ViewTabs.css';

interface ViewTabsProps {
  active: ViewTab;
  onChange: (view: ViewTab) => void;
}

export function ViewTabs({ active, onChange }: ViewTabsProps) {
  return (
    <div className="view-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'graph'}
        className={`view-tabs__btn ${active === 'graph' ? 'view-tabs__btn--active' : ''}`}
        onClick={() => onChange('graph')}
      >
        <span className="view-tabs__icon">◇</span>
        路线图
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'map'}
        className={`view-tabs__btn ${active === 'map' ? 'view-tabs__btn--active' : ''}`}
        onClick={() => onChange('map')}
      >
        <span className="view-tabs__icon">◎</span>
        地图
      </button>
    </div>
  );
}
