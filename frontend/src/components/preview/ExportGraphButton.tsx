import { useState } from 'react';
import { selectActiveItinerary, selectOverviewColumnWidths, usePlanStore } from '../../stores/usePlanStore';
import { getOverviewMetrics, layoutOverview } from '../../utils/layoutOverview';
import {
  ExportGraphError,
  exportElementToPng,
  exportOverviewShell,
  waitForOverviewExportReady,
} from '../../utils/exportGraphImage';
import { exportElementSharpPng, exportOverviewSharpPng } from '../../utils/exportSnapPng';
import './ExportGraphButton.css';

type ExportKind = 'png' | 'sharp';

export function ExportGraphButton() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const graphViewMode = usePlanStore((s) => s.graphViewMode);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const plan = usePlanStore((s) => s.getActivePlan());
  const [job, setJob] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ExportKind | null>(null);

  if (!itinerary?.days.length) return null;

  const handleExport = async (kind: ExportKind) => {
    setJob(kind);
    setExportError(null);
    setErrorKind(null);
    const setExportCapture = usePlanStore.getState().setExportOverviewCapture;

    try {
      const dest = plan.trip_request.destination.trim() || '行程';
      if (graphViewMode === 'overview') {
        const shell = document.querySelector('[data-export-overview]') as HTMLElement | null;
        if (!shell) {
          throw new ExportGraphError('未找到总览图');
        }
        const metrics = getOverviewMetrics(itinerary.days.length);
        const overviewColumnWidths = selectOverviewColumnWidths(usePlanStore.getState());
        const spread = usePlanStore.getState().overviewSpread;
        const layout = layoutOverview(itinerary.days, metrics, overviewColumnWidths, { spread });

        setExportCapture(true);
        await waitForOverviewExportReady(
          shell,
          itinerary.days.length,
          layout.regions.length,
        );
        if (kind === 'sharp') {
          await exportOverviewSharpPng(shell, layout, `${dest}-总览-高清.png`);
        } else {
          await exportOverviewShell(shell, layout, `${dest}-总览.png`);
        }
      } else {
        const canvas = document.querySelector('[data-export-day-graph]') as HTMLElement | null;
        if (!canvas) {
          throw new ExportGraphError('未找到单日路线图');
        }
        const day = itinerary.days[activeDayIndex];
        const dayLabel = `第${day?.day_index ?? 1}天`;
        if (kind === 'sharp') {
          await exportElementSharpPng(canvas, `${dest}-${dayLabel}-高清.png`);
        } else {
          await exportElementToPng(canvas, `${dest}-${dayLabel}.png`);
        }
      }
    } catch (err) {
      const message =
        err instanceof ExportGraphError
          ? err.message
          : err instanceof Error
            ? err.message
            : '导出失败';
      console.error('[export]', err);
      setExportError(message);
      setErrorKind(kind);
    } finally {
      setExportCapture(false);
      setJob(null);
    }
  };

  const labelFor = (kind: ExportKind, idle: string, busy: string) => {
    if (job === kind) return busy;
    if (errorKind === kind) return '失败，重试';
    return idle;
  };

  return (
    <div className="export-graph-btns">
      <button
        type="button"
        className={`export-graph-btn${errorKind === 'png' ? ' export-graph-btn--error' : ''}`}
        onClick={() => handleExport('png')}
        disabled={job !== null}
        title={errorKind === 'png' && exportError ? exportError : '导出当前路线图为 PNG'}
      >
        {labelFor('png', '导出 PNG', '导出中…')}
      </button>
      <button
        type="button"
        className={`export-graph-btn${errorKind === 'sharp' ? ' export-graph-btn--error' : ''}`}
        onClick={() => handleExport('sharp')}
        disabled={job !== null}
        title={
          errorKind === 'sharp' && exportError
            ? exportError
            : '用 SnapDOM 导出 2 倍清晰的整张长图'
        }
      >
        {labelFor('sharp', '高清长图', '生成中…')}
      </button>
      {exportError ? <span className="export-graph-btns__error">{exportError}</span> : null}
    </div>
  );
}
