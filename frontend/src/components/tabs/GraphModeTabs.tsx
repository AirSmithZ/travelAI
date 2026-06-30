import type { GraphViewMode } from '../../types/itinerary';
import './GraphModeTabs.css';

interface GraphModeTabsProps {
  active: GraphViewMode;
  onChange: (mode: GraphViewMode) => void;
  disabled?: boolean;
}

export function GraphModeTabs({ active, onChange, disabled }: GraphModeTabsProps) {
  return (
    <div className="graph-mode-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'day'}
        disabled={disabled}
        className={`graph-mode-tabs__btn ${active === 'day' ? 'graph-mode-tabs__btn--active' : ''}`}
        onClick={() => onChange('day')}
      >
        单日
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'overview'}
        disabled={disabled}
        className={`graph-mode-tabs__btn ${active === 'overview' ? 'graph-mode-tabs__btn--active' : ''}`}
        onClick={() => onChange('overview')}
      >
        总览
      </button>
    </div>
  );
}
