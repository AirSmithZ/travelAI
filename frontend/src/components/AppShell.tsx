import { PlanSelector } from './plan/PlanSelector';
import { InputPanel } from './input/InputPanel';
import { PreviewPane } from './preview/PreviewPane';
import { usePlanStore, selectLeftPanelCollapsed } from '../stores/usePlanStore';
import { useLeftPanelWidth } from '../hooks/useLeftPanelWidth';
import { GlobalToast } from './ui/GlobalToast';
import './AppShell.css';

export function AppShell() {
  const { width: panelWidth, startResize } = useLeftPanelWidth();
  const leftPanelCollapsed = usePlanStore(selectLeftPanelCollapsed);

  return (
    <div className="app-shell">
      <GlobalToast />
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <span className="app-shell__logo">✦</span>
          <div>
            <h1 className="app-shell__title">Travel Planner</h1>
            <p className="app-shell__subtitle">AI 行程规划</p>
          </div>
        </div>
        <PlanSelector />
      </header>

      <div className="app-shell__body">
        <div
          className={`app-shell__panel${leftPanelCollapsed ? ' app-shell__panel--collapsed' : ''}`}
          style={leftPanelCollapsed ? undefined : { width: panelWidth }}
        >
          <InputPanel />
        </div>
        <div
          className={`app-shell__resize-handle${leftPanelCollapsed ? ' app-shell__resize-handle--hidden' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左栏宽度"
          aria-hidden={leftPanelCollapsed}
          onMouseDown={(e) => {
            if (leftPanelCollapsed) return;
            e.preventDefault();
            startResize(e.clientX);
          }}
        />
        <div className="app-shell__preview">
          <PreviewPane />
        </div>
      </div>
    </div>
  );
}
