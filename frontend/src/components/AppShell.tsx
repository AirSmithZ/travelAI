import { useEffect, useState } from 'react';
import { PlanSelector } from './plan/PlanSelector';
import { InputPanel } from './input/InputPanel';
import { PreviewPane } from './preview/PreviewPane';
import { IntelDirtyBanner } from './flow/IntelDirtyBanner';
import { ExpensePanel } from './expense/ExpensePanel';
import { TripDigestPanel } from './digest/TripDigestPanel';
import {
  usePlanStore,
  selectLeftPanelCollapsed,
  selectPreviewCollapsed,
} from '../stores/usePlanStore';
import { useLeftPanelWidth } from '../hooks/useLeftPanelWidth';
import { GlobalToast } from './ui/GlobalToast';
import './AppShell.css';

function PanelChevron({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M9 3 4.5 7 9 11' : 'M5 3 9.5 7 5 11';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell() {
  const { width: panelWidth, startResize } = useLeftPanelWidth();
  const leftPanelCollapsed = usePlanStore(selectLeftPanelCollapsed);
  const previewCollapsed = usePlanStore(selectPreviewCollapsed);
  const setLeftPanelUserOverride = usePlanStore((s) => s.setLeftPanelUserOverride);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const canHideLeft = !previewCollapsed;

  useEffect(() => {
    if (!previewCollapsed) return;
    if (usePlanStore.getState().leftPanelUserOverride === 'hidden') {
      setLeftPanelUserOverride('auto');
    }
  }, [previewCollapsed, setLeftPanelUserOverride]);

  return (
    <div className="app-shell">
      <GlobalToast />
      <ExpensePanel open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <TripDigestPanel open={digestOpen} onClose={() => setDigestOpen(false)} />
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <span className="app-shell__logo">✦</span>
          <div>
            <h1 className="app-shell__title">Travel Planner</h1>
            <p className="app-shell__subtitle">AI 行程规划</p>
          </div>
        </div>
        <div className="app-shell__header-actions">
          <button
            type="button"
            className="app-shell__expense-btn"
            onClick={() => {
              setDigestOpen(true);
              setExpenseOpen(false);
            }}
            title="行程汇总：天数、去向、亮点"
            aria-label="打开行程汇总"
            data-testid="open-digest"
          >
            汇总
          </button>
          <button
            type="button"
            className="app-shell__expense-btn"
            onClick={() => {
              setExpenseOpen(true);
              setDigestOpen(false);
            }}
            title="开销汇总"
            aria-label="打开开销面板"
          >
            开销
          </button>
          <PlanSelector />
        </div>
      </header>
      <IntelDirtyBanner />

      <div className="app-shell__body">
        <div
          className={`app-shell__panel${leftPanelCollapsed ? ' app-shell__panel--collapsed' : ''}`}
          style={
            leftPanelCollapsed
              ? undefined
              : {
                  width: previewCollapsed ? undefined : panelWidth,
                  flex: previewCollapsed ? 1 : undefined,
                }
          }
          aria-hidden={leftPanelCollapsed}
          inert={leftPanelCollapsed ? true : undefined}
        >
          <div id="travel-left-panel" className="app-shell__panel-body">
            <InputPanel />
          </div>
        </div>
        {!leftPanelCollapsed && canHideLeft && (
          <button
            type="button"
            className="app-shell__panel-hide"
            onClick={() => setLeftPanelUserOverride('hidden')}
            aria-expanded={true}
            aria-controls="travel-left-panel"
            title="收起左侧面板"
            aria-label="收起左侧面板"
          >
            <PanelChevron direction="left" />
            <span className="app-shell__panel-hide-label">收起</span>
          </button>
        )}
        {leftPanelCollapsed && (
          <button
            type="button"
            className="app-shell__panel-reveal"
            onClick={() => setLeftPanelUserOverride('open')}
            aria-expanded={false}
            aria-controls="travel-left-panel"
            title="展开左侧面板"
            aria-label="展开左侧面板"
          >
            <PanelChevron direction="right" />
            <span className="app-shell__panel-reveal-label">展开</span>
          </button>
        )}
        <div
          className={`app-shell__resize-handle${
            leftPanelCollapsed || previewCollapsed
              ? ' app-shell__resize-handle--hidden'
              : ''
          }`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左栏宽度"
          aria-hidden={leftPanelCollapsed || previewCollapsed}
          onMouseDown={(e) => {
            if (leftPanelCollapsed || previewCollapsed) return;
            e.preventDefault();
            startResize(e.clientX);
          }}
        />
        <div
          className={`app-shell__preview${previewCollapsed ? ' app-shell__preview--collapsed' : ''}`}
          aria-hidden={previewCollapsed}
        >
          {!previewCollapsed && <PreviewPane />}
        </div>
      </div>
    </div>
  );
}
