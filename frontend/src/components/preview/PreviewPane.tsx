import { motion, AnimatePresence } from 'framer-motion';
import { usePlanStore, selectActivePlan } from '../../stores/usePlanStore';
import { ViewTabs } from '../tabs/ViewTabs';
import { GraphModeTabs } from '../tabs/GraphModeTabs';
import { DayTabs } from '../tabs/DayTabs';
import { ItineraryGraph } from '../graph/ItineraryGraph';
import { TravelMap } from '../map/TravelMap';
import { OverviewGraphView } from './OverviewGraphView';
import { ExportGraphButton } from './ExportGraphButton';
import { StayZoneToolbarButton } from './StayZoneToolbarButton';
import { EmptyPreview } from './EmptyPreview';
import './PreviewPane.css';

export function PreviewPane() {
  const plan = usePlanStore(selectActivePlan);
  const itinerary = plan.itinerary;
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const activeView = usePlanStore((s) => s.activeView);
  const graphViewMode = usePlanStore((s) => s.graphViewMode);
  const selectDay = usePlanStore((s) => s.selectDay);
  const addDay = usePlanStore((s) => s.addDay);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setGraphViewMode = usePlanStore((s) => s.setGraphViewMode);

  const hasItinerary = Boolean(itinerary?.days.length);
  const stayHotelMapPins = usePlanStore((s) => s.stayHotelMapPins);
  const previewExpanded = usePlanStore((s) => s.previewExpandedWithoutItinerary);
  // P97/P100: 无行程仅在用户展开且有片区/酒店钉时渲染地图（避免空白底图）
  const hasStayGeometry = (plan.travel_intel.recommended_stay_zones ?? []).some((z) =>
    Boolean(z.geometry),
  );
  const showMapOnly =
    !hasItinerary &&
    previewExpanded &&
    (stayHotelMapPins.length > 0 || hasStayGeometry);
  const showGraphModeTabs = hasItinerary;
  // 总览 = 全部天矩阵/全图，日期在列头；工具栏日期条仅单日模式
  const showDayTabs = hasItinerary && graphViewMode === 'day';

  return (
    <div className="preview-pane">
      <div className="preview-pane__toolbar">
        <div className="preview-pane__toolbar-left">
          {showGraphModeTabs && (
            <GraphModeTabs
              active={graphViewMode}
              onChange={setGraphViewMode}
              disabled={!hasItinerary}
            />
          )}
          <ViewTabs active={activeView} onChange={setActiveView} />
          {hasItinerary && activeView === 'graph' && <ExportGraphButton />}
          <StayZoneToolbarButton />
        </div>
        {showDayTabs && itinerary && (
          <DayTabs
            days={itinerary.days}
            activeIndex={activeDayIndex}
            onChange={selectDay}
            onAddDay={() => addDay()}
          />
        )}
      </div>

      <main className="preview-pane__main">
        <AnimatePresence mode="wait">
          {!hasItinerary && !showMapOnly ? (
            <motion.div
              key="empty"
              className="preview-pane__view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyPreview type={activeView} phase={plan.phase} />
            </motion.div>
          ) : showMapOnly ? (
            // P108: 勿对地图做 opacity 动画——MapLibre 在 opacity:0 / transform 父级下易丢自定义层与镜头
            <div key="map-zones" className="preview-pane__view">
              <TravelMap visible />
            </div>
          ) : (
            <motion.div
              key="preview-stack"
              className="preview-pane__stack"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className={`preview-pane__view preview-pane__view--graph${
                  activeView !== 'graph' ? ' preview-pane__view--hidden' : ''
                }`}
                aria-hidden={activeView !== 'graph'}
              >
                {graphViewMode === 'overview' ? <OverviewGraphView /> : <ItineraryGraph />}
              </div>
              <div
                className={`preview-pane__view preview-pane__view--map${
                  activeView !== 'map' ? ' preview-pane__view--hidden' : ''
                }`}
                aria-hidden={activeView !== 'map'}
              >
                <TravelMap visible={activeView === 'map'} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
