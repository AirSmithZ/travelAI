import { useState } from 'react';
import { selectActiveItinerary, selectOverviewColumnWidths, usePlanStore } from '../../stores/usePlanStore';
import { getOverviewMetrics, layoutOverview } from '../../utils/layoutOverview';
import {
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

  if (!itinerary?.days.length) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const dest = plan.trip_request.destination.trim() || '行程';
      if (graphViewMode === 'overview') {
        const shell = document.querySelector('[data-export-overview]') as HTMLElement | null;
        if (!shell) return;
        const metrics = getOverviewMetrics(itinerary.days.length);
        const overviewColumnWidths = selectOverviewColumnWidths(usePlanStore.getState());
        const layout = layoutOverview(itinerary.days, metrics, overviewColumnWidths);
        const setExportCapture = usePlanStore.getState().setExportOverviewCapture;
        setExportCapture(true);
        await waitForOverviewExportReady(
          shell,
          itinerary.days.length,
          layout.regions.length,
        );
        try {
          await exportOverviewShell(shell, layout, `${dest}-总览.png`);
        } finally {
          setExportCapture(false);
        }
      } else {
        const canvas = document.querySelector('[data-export-day-graph]') as HTMLElement | null;
        if (!canvas) return;
        const day = itinerary.days[activeDayIndex];
        const filename = `${dest}-第${day?.day_index ?? 1}天.png`;
        await exportElementToPng(canvas, filename);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      className="export-graph-btn"
      onClick={handleExport}
      disabled={exporting}
      title="导出当前路线图为 PNG"
    >
      {exporting ? '导出中…' : '导出 PNG'}
    </button>
  );
}
