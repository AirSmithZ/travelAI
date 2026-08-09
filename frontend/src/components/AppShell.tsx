import { useState } from 'react';
import { PlanSelector } from './plan/PlanSelector';
import { InputPanel } from './input/InputPanel';
import { PreviewPane } from './preview/PreviewPane';
import { IntelDirtyBanner } from './flow/IntelDirtyBanner';
import { ExpensePanel } from './expense/ExpensePanel';
import {
  usePlanStore,
  selectLeftPanelCollapsed,
  selectPreviewCollapsed,
} from '../stores/usePlanStore';
import { useLeftPanelWidth } from '../hooks/useLeftPanelWidth';
import { GlobalToast } from './ui/GlobalToast';
import './AppShell.css';

export function AppShell() {
  const { width: panelWidth, startResize } = useLeftPanelWidth();
  const leftPanelCollapsed = usePlanStore(selectLeftPanelCollapsed);
  const previewCollapsed = usePlanStore(selectPreviewCollapsed);
  const [expenseOpen, setExpenseOpen] = useState(false);

  return (
    <div className="app-shell">
      <GlobalToast />
      <ExpensePanel open={expenseOpen} onClose={() => setExpenseOpen(false)} />
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
            onClick={() => setExpenseOpen(true)}
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
        >
          <InputPanel />
        </div>
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
