import { useState } from 'react';
import { selectActiveItinerary, selectOverviewColumnWidths, usePlanStore } from '../../stores/usePlanStore';
import { getOverviewMetrics, layoutOverview } from '../../utils/layoutOverview';
import {
  ExportGraphError,
  exportElementToPng,
  exportOverviewShell,
  waitForOverviewExportReady,
} from '../../utils/exportGraphImage';
import './ExportGraphButton.css';

export function ExportGraphButton() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const graphViewMode = usePlanStore((s) => s.graphViewMode);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const plan = usePlanStore((s) => s.getActivePlan());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!itinerary?.days.length) return null;

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
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
        const layout = layoutOverview(itinerary.days, metrics, overviewColumnWidths);

        setExportCapture(true);
        await waitForOverviewExportReady(
          shell,
          itinerary.days.length,
          layout.regions.length,
        );
        await exportOverviewShell(shell, layout, `${dest}-总览.png`);
      } else {
        const canvas = document.querySelector('[data-export-day-graph]') as HTMLElement | null;
        if (!canvas) {
          throw new ExportGraphError('未找到单日路线图');
        }
        const day = itinerary.days[activeDayIndex];
        const filename = `${dest}-第${day?.day_index ?? 1}天.png`;
        await exportElementToPng(canvas, filename);
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
    } finally {
      setExportCapture(false);
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      className={`export-graph-btn${exportError ? ' export-graph-btn--error' : ''}`}
      onClick={handleExport}
      disabled={exporting}
      title={exportError ? `导出失败：${exportError}` : '导出当前路线图为 PNG'}
    >
      {exporting ? '导出中…' : exportError ? '导出失败，重试' : '导出 PNG'}
    </button>
  );
}
