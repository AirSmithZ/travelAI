import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlanStore, selectActiveItinerary, selectOverviewColumnWidths } from '../../stores/usePlanStore';
import { useOverviewScrollSync } from '../../hooks/useOverviewScrollSync';
import { useOverviewColumnVirtualizer } from '../../hooks/useOverviewColumnVirtualizer';
import { useOverviewColumnResize } from '../../hooks/useOverviewColumnResize';
import { useOverviewNodeDrag } from '../../hooks/useOverviewNodeDrag';
import { useOverviewNodeAnchors } from '../../hooks/useOverviewNodeAnchors';
import {
  overviewHotelAlignmentWarnings,
  primaryHotelNodeIds,
} from '../../utils/primaryHotelOverview';
import { OVERVIEW_REGION_ENTER_MS } from '../../utils/graphLayoutConstants';
import { formatWeatherBrief } from '../../utils/formatWeather';
import {
  CELL_PADDING,
  COLUMN_HEADER_HEIGHT,
  cellKey,
  computeOverviewMatrixPlacements,
  type CellNodePlacement,
  getOverviewMetrics,
  getRegionTintVar,
  layoutOverview,
} from '../../utils/layoutOverview';
import { getCellLongNote, getCrossRegionEdges } from '../../utils/overviewRoute';
import {
  EXPORT_SHELL_LIGHT,
  REGION_EXPORT_CELL_BG_LIGHT,
  REGION_EXPORT_RAIL_BG_LIGHT,
} from '../../utils/overviewExportTokens';
import { OverviewRouteChain } from './OverviewRouteChain';
import { OverviewEdgeLayer } from './OverviewEdgeLayer';
import { OverviewDragGhost } from './OverviewDragGhost';
import { OverviewCellNote } from './OverviewCellNote';
import '../graph/ItineraryGraph.css';
import './OverviewGraphView.css';

function formatHeaderDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

export function OverviewGraphView() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const travelIntel = usePlanStore((s) => s.getActivePlan().travel_intel);
  const selectedNodeId = usePlanStore((s) => s.selectedNodeId);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const overviewScrollDay = usePlanStore((s) => s.overviewScrollDay);
  const selectNode = usePlanStore((s) => s.selectNode);
  const selectDay = usePlanStore((s) => s.selectDay);
  const selectRegion = usePlanStore((s) => s.selectRegion);
  const addDay = usePlanStore((s) => s.addDay);
  const addRegion = usePlanStore((s) => s.addRegion);
  const editorTarget = usePlanStore((s) => s.editorTarget);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setActiveDay = usePlanStore((s) => s.setActiveDay);
  const clearOverviewScrollDay = usePlanStore((s) => s.clearOverviewScrollDay);
  const updateNode = usePlanStore((s) => s.updateNode);
  const recordItineraryHistory = usePlanStore((s) => s.recordItineraryHistory);
  const overviewColumnWidths = usePlanStore(selectOverviewColumnWidths);
  const setOverviewColumnWidth = usePlanStore((s) => s.setOverviewColumnWidth);
  const canUndo = usePlanStore(
    (s) => (s.itineraryHistories[s.activePlanId]?.past.length ?? 0) > 0,
  );

  const matrixRef = useRef<HTMLDivElement>(null);
  const [focusedDayIndex, setFocusedDayIndex] = useState<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [regionEnter, setRegionEnter] = useState<{
    nodeId: string;
    direction: 'up' | 'down';
  } | null>(null);
  const regionEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { bodyRef, scrollLeft, scrollTop, onBodyScroll, forwardWheelToBody } =
    useOverviewScrollSync();

  const dayCount = itinerary?.days.length ?? 0;
  const exportOverviewCapture = usePlanStore((s) => s.exportOverviewCapture);
  const metrics = useMemo(() => getOverviewMetrics(dayCount), [dayCount]);

  const crossRegionEdges = useMemo(() => {
    if (!itinerary) return [];
    return itinerary.days.flatMap((day) => getCrossRegionEdges(day));
  }, [itinerary]);

  const layout = useMemo(
    () => (itinerary ? layoutOverview(itinerary.days, metrics, overviewColumnWidths) : null),
    [itinerary, metrics, overviewColumnWidths],
  );

  const { onResizePointerDown, resizingDayIndex } = useOverviewColumnResize(
    setOverviewColumnWidth,
    metrics.minColumnWidth,
  );

  const handleDragCommit = useCallback(
    (
      dayIndex: number,
      nodeId: string,
      patch: {
        region?: string;
        fromRegion?: string;
        overview_offset?: { x: number; y: number };
      },
    ) => {
      recordItineraryHistory();

      const updates: {
        region?: string;
        overview_offset?: { x: number; y: number };
      } = {};

      if (patch.region) {
        updates.region = patch.region;
      }
      if (patch.overview_offset) {
        updates.overview_offset = patch.overview_offset;
      } else if (patch.region && patch.fromRegion) {
        updates.overview_offset = undefined;
      }

      if (Object.keys(updates).length === 0) return;

      updateNode(dayIndex, nodeId, updates);

      if (patch.region && patch.fromRegion) {
        const regions = layout?.regions ?? [];
        const fromIdx = regions.indexOf(patch.fromRegion);
        const toIdx = regions.indexOf(patch.region);
        const direction: 'up' | 'down' = toIdx >= fromIdx ? 'down' : 'up';

        setRegionEnter({ nodeId, direction });
        if (regionEnterTimerRef.current) clearTimeout(regionEnterTimerRef.current);
        regionEnterTimerRef.current = setTimeout(
          () => setRegionEnter(null),
          OVERVIEW_REGION_ENTER_MS,
        );
      }
    },
    [updateNode, recordItineraryHistory, layout?.regions],
  );

  const emptyLayout = useMemo(
    () => ({
      regions: [] as string[],
      regionHeights: new Map<string, number>(),
      cells: [],
      columnWidths: [] as number[],
      columnOffsets: [] as number[],
      railWidth: 96,
      width: 0,
      height: 0,
      columnWidth: 0,
    }),
    [],
  );

  const {
    dragPreview,
    onNodePointerDown: dragPointerDown,
    onNodePointerUp,
  } = useOverviewNodeDrag({
    matrixRef,
    layout: layout ?? emptyLayout,
    days: itinerary?.days ?? [],
    metrics,
    onCommit: handleDragCommit,
  });

  const columnWidths = layout?.columnWidths ?? [];
  const columnOffsets = layout?.columnOffsets ?? [];
  const visibleRange = useOverviewColumnVirtualizer(
    bodyRef,
    dayCount,
    columnOffsets,
    columnWidths,
    metrics.virtualize && !exportOverviewCapture,
  );

  const regionTops = useMemo(() => {
    if (!layout) return new Map<string, number>();
    let y = 0;
    const tops = new Map<string, number>();
    for (const region of layout.regions) {
      tops.set(region, y);
      y += layout.regionHeights.get(region) ?? 40;
    }
    return tops;
  }, [layout]);

  const cellMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof layout>['cells'][number]>();
    layout?.cells.forEach((c) => map.set(cellKey(c.dayIndex, c.region), c));
    return map;
  }, [layout]);

  const matrixPlacements = useMemo(() => {
    if (!layout) return new Map<string, CellNodePlacement>();
    return computeOverviewMatrixPlacements(layout);
  }, [layout]);

  const liveMatrixPlacements = useMemo(() => {
    if (!dragPreview) return matrixPlacements;
    const map = new Map(matrixPlacements);
    const existing = map.get(dragPreview.nodeId);
    if (!existing) return map;

    map.set(dragPreview.nodeId, {
      ...existing,
      x: dragPreview.ghostMatrixLeft,
      y: dragPreview.ghostMatrixTop,
      width: dragPreview.ghostWidth,
      height: dragPreview.ghostHeight,
    });
    return map;
  }, [matrixPlacements, dragPreview]);

  const primaryHotelIds = useMemo(
    () => primaryHotelNodeIds(itinerary, travelIntel),
    [itinerary, travelIntel],
  );
  const hotelAlignWarnings = useMemo(
    () => overviewHotelAlignmentWarnings(itinerary, travelIntel),
    [itinerary, travelIntel],
  );

  const domAnchors = useOverviewNodeAnchors(matrixRef, [
    liveMatrixPlacements.size,
    itinerary?.days.length,
    layout?.regions.length,
  ]);

  /** OV-01: prefer measured DOM centers when available */
  const edgePlacements = useMemo(() => {
    if (domAnchors.size === 0) return liveMatrixPlacements;
    const map = new Map(liveMatrixPlacements);
    for (const [id, place] of map) {
      const a = domAnchors.get(id);
      if (!a) continue;
      map.set(id, {
        ...place,
        x: a.x - place.width / 2,
        y: a.y - place.height / 2,
      });
    }
    return map;
  }, [liveMatrixPlacements, domAnchors]);

  const dragGhostNode = useMemo(() => {
    if (!dragPreview || !itinerary) return null;
    return itinerary.days[dragPreview.dayIndex]?.nodes.find(
      (n) => n.id === dragPreview.nodeId,
    ) ?? null;
  }, [dragPreview, itinerary]);

  const matrixDayIndices = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i),
    [dayCount],
  );

  const scrollToDay = useCallback(
    (dayIndex: number) => {
      selectDay(dayIndex);
      const left = layout?.columnOffsets[dayIndex] ?? 0;
      bodyRef.current?.scrollTo({ left, behavior: 'smooth' });
      setFocusedDayIndex(dayIndex);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => setFocusedDayIndex(null), 2000);
    },
    [bodyRef, layout, selectDay],
  );

  const handleAddDay = useCallback(() => {
    const newIndex = addDay();
    if (newIndex >= 0) scrollToDay(newIndex);
  }, [addDay, scrollToDay]);

  const handleAddRegion = useCallback(() => {
    const name = window.prompt('新建区域名称');
    if (name?.trim()) addRegion(name.trim(), activeDayIndex);
  }, [addRegion, activeDayIndex]);

  useEffect(() => {
    if (overviewScrollDay !== null) {
      scrollToDay(overviewScrollDay);
      clearOverviewScrollDay();
    }
  }, [overviewScrollDay, scrollToDay, clearOverviewScrollDay]);

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (regionEnterTimerRef.current) clearTimeout(regionEnterTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      const store = usePlanStore.getState();
      if (e.shiftKey) {
        if (store.canRedoItinerary()) store.redoItinerary();
      } else if (store.canUndoItinerary()) {
        store.undoItinerary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const makeDragDown = useCallback(
    (
      dayIndex: number,
      region: string,
      colW: number,
      cellLayout: NonNullable<typeof layout>['cells'][number]['cellLayout'],
      nodes: { id: string; overview_offset?: { x: number; y: number } }[],
    ) =>
      (e: React.PointerEvent, nodeId: string) => {
        const place = cellLayout.placements.get(nodeId);
        const node = nodes.find((n) => n.id === nodeId);
        const offsetX = node?.overview_offset?.x ?? 0;
        const offsetY = node?.overview_offset?.y ?? 0;
        const baseX = (place?.x ?? 0) - offsetX;
        const basePlaceY = (place?.y ?? 0) - offsetY;
        dragPointerDown(e, nodeId, dayIndex, region, {
          originOffsetX: offsetX,
          originOffsetY: offsetY,
          baseX,
          basePlaceY,
          nodeWidth: place?.width ?? metrics.nodeWidth,
          nodeHeight: place?.height ?? metrics.nodeHeight,
          cellInnerWidth: colW - CELL_PADDING * 2,
        });
      },
    [dragPointerDown, metrics.nodeWidth, metrics.nodeHeight],
  );

  if (!itinerary || !layout) return null;

  const isExporting = exportOverviewCapture;
  const regionStackHeight = [...layout.regionHeights.values()].reduce((a, b) => a + b, 0);
  const contentHeight = regionStackHeight;
  const matrixWidth = layout.columnOffsets.length
    ? layout.columnOffsets[layout.columnOffsets.length - 1] +
      layout.columnWidths[layout.columnWidths.length - 1]
    : 0;
  const headerInnerWidth = isExporting ? matrixWidth : matrixWidth + 40;

  const cssVars = {
    '--node-width': `${metrics.nodeWidth}px`,
    '--node-height': `${metrics.nodeHeight}px`,
    '--commute-width': `${metrics.commuteWidth}px`,
    '--overview-header-height': `${COLUMN_HEADER_HEIGHT}px`,
    '--overview-rail-width': `${layout?.railWidth ?? 96}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`overview-graph${metrics.compact ? ' overview-graph--compact' : ''}`}
      style={cssVars}
    >
      {hotelAlignWarnings.length > 0 && !isExporting && (
        <p className="overview-hotel-warn" role="status">
          {hotelAlignWarnings[0]}
          {hotelAlignWarnings.length > 1 ? `（+${hotelAlignWarnings.length - 1}）` : ''}
        </p>
      )}
      <div className="overview-shell" data-export-overview data-export-theme="light">
        <div className="overview-shell__corner" aria-hidden>
          <span className="overview-corner__label">区域</span>
        </div>

        <div
          className="overview-shell__header"
          onWheel={forwardWheelToBody}
          style={
            isExporting ? { background: EXPORT_SHELL_LIGHT.headerBg } : undefined
          }
        >
          <div
            className="overview-shell__header-inner"
            style={{
              width: headerInnerWidth,
              transform: isExporting ? undefined : `translate3d(-${scrollLeft}px, 0, 0)`,
            }}
          >
            {itinerary.days.map((day, i) => {
              if (
                metrics.virtualize &&
                !exportOverviewCapture &&
                (i < visibleRange.start || i >= visibleRange.end)
              ) {
                return null;
              }
              const isFocused =
                !isExporting &&
                (focusedDayIndex === i ||
                  activeDayIndex === i ||
                  (editorTarget?.kind === 'form' &&
                    editorTarget.focus === 'day' &&
                    editorTarget.dayIndex === i));
              const colW = layout.columnWidths[i] ?? metrics.minColumnWidth;
              const colLeft = layout.columnOffsets[i] ?? 0;
              const tempLabel = day.weather ? formatWeatherBrief(day.weather) : null;

              const isResizing = resizingDayIndex === i;

              return (
                <div
                  key={day.day_index}
                  className={`overview-headers__col-wrap ${isResizing ? 'overview-headers__col-wrap--resizing' : ''}`}
                  style={{ left: colLeft, width: colW, height: COLUMN_HEADER_HEIGHT }}
                >
                  <button
                    type="button"
                    className={`overview-headers__col ${isFocused ? 'overview-headers__col--focused' : ''}`}
                    style={{ width: '100%', height: '100%' }}
                    onClick={() => scrollToDay(i)}
                  >
                  <span className="overview-headers__row overview-headers__row--primary">
                    <span className="overview-headers__day">Day {day.day_index}</span>
                    <span className="overview-headers__sep">·</span>
                    <span className="overview-headers__meta">{formatHeaderDate(day.date)}</span>
                    <span className="overview-headers__sep">·</span>
                    <span className="overview-headers__meta">{day.weekday}</span>
                    {tempLabel && (
                      <>
                        <span className="overview-headers__sep">·</span>
                        <span className="overview-headers__meta overview-headers__weather">{tempLabel}</span>
                      </>
                    )}
                  </span>
                  </button>
                  <div
                    className="overview-col-resize-handle"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`调整 Day ${day.day_index} 列宽`}
                    onPointerDown={(e) => onResizePointerDown(e, i, colW)}
                    hidden={isExporting}
                  />
                </div>
              );
            })}
            {!isExporting && (
              <button
                type="button"
                className="overview-headers__add-day"
                style={{ left: matrixWidth, height: COLUMN_HEADER_HEIGHT }}
                aria-label="新增一天"
                onClick={handleAddDay}
              >
                ＋
              </button>
            )}
          </div>
        </div>

        <div
          className="overview-shell__rail"
          onWheel={forwardWheelToBody}
          style={
            isExporting ? { background: EXPORT_SHELL_LIGHT.railBg } : undefined
          }
        >
          <div
            className="overview-shell__rail-inner"
            style={{
              height: contentHeight,
              transform: isExporting ? undefined : `translate3d(0, -${scrollTop}px, 0)`,
            }}
          >
            {layout.regions.map((region, regionIndex) => {
              const rowH = layout.regionHeights.get(region) ?? 40;
              const top = regionTops.get(region) ?? 0;
              const tintVar = getRegionTintVar(regionIndex);
              const isDropTarget =
                dragPreview != null &&
                dragPreview.targetRegion === region &&
                dragPreview.targetRegion !== dragPreview.sourceRegion;
              const isRegionSelected =
                editorTarget?.kind === 'form' &&
                editorTarget.focus === 'region' &&
                editorTarget.regionName === region;
              return (
                <button
                  key={region}
                  type="button"
                  className={`region-rail__label ${isDropTarget ? 'region-rail__label--drop-target' : ''}${isRegionSelected ? ' region-rail__label--selected' : ''}`}
                  title={region}
                  style={{
                    top,
                    height: rowH,
                    background: isExporting
                      ? REGION_EXPORT_RAIL_BG_LIGHT[
                          regionIndex % REGION_EXPORT_RAIL_BG_LIGHT.length
                        ]
                      : `color-mix(in srgb, var(${tintVar}) 100%, transparent)`,
                  }}
                  onClick={() => selectRegion(region)}
                >
                  <span className="region-rail__label-text">{region}</span>
                </button>
              );
            })}
            {!isExporting && (
              <button
                type="button"
                className="region-rail__add"
                style={{ top: contentHeight + 4 }}
                aria-label="新建区域"
                onClick={handleAddRegion}
              >
                ＋ 区域
              </button>
            )}
          </div>
        </div>

        <div
          ref={bodyRef}
          className="overview-shell__body"
          onScroll={onBodyScroll}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              selectNode(null);
            }
          }}
        >
          <div
            ref={matrixRef}
            className="overview-matrix"
            style={{ width: matrixWidth, height: contentHeight }}
          >
            <div className="overview-matrix__backgrounds" aria-hidden>
            {layout.regions.map((region, regionIndex) => {
              const regionTop = regionTops.get(region) ?? 0;
              const tintVar = getRegionTintVar(regionIndex);

              return matrixDayIndices.map((dayIndex) => {
                const key = cellKey(dayIndex, region);
                const colW = layout.columnWidths[dayIndex] ?? metrics.minColumnWidth;
                const colLeft = layout.columnOffsets[dayIndex] ?? 0;
                const rowH = layout.regionHeights.get(region) ?? 40;
                const isFocusedCol = !isExporting && (focusedDayIndex === dayIndex || activeDayIndex === dayIndex);

                return (
                  <div
                    key={`bg-${key}`}
                    className={`overview-cell-bg ${isFocusedCol ? 'overview-cell-bg--focused' : ''}`}
                    style={{
                      left: colLeft,
                      top: regionTop,
                      width: colW,
                      height: rowH,
                      background: isExporting
                        ? REGION_EXPORT_CELL_BG_LIGHT[
                            regionIndex % REGION_EXPORT_CELL_BG_LIGHT.length
                          ]
                        : `color-mix(in srgb, var(${tintVar}) 10%, var(--bg-base))`,
                    }}
                  />
                );
              });
            })}

            </div>

            <OverviewEdgeLayer
              width={matrixWidth}
              height={contentHeight}
              crossRegionEdges={crossRegionEdges}
              placements={edgePlacements}
            />

            <div className="overview-matrix__foreground">
            {dragPreview && dragGhostNode && !isExporting && (
              <OverviewDragGhost
                node={dragGhostNode}
                left={dragPreview.ghostMatrixLeft}
                top={dragPreview.ghostMatrixTop}
                width={dragPreview.ghostWidth}
                height={dragPreview.ghostHeight}
                compact={metrics.compact}
              />
            )}
            {layout.regions.map((region) => {
              const regionTop = regionTops.get(region) ?? 0;

              return matrixDayIndices.map((dayIndex) => {
                const key = cellKey(dayIndex, region);
                const cell = cellMap.get(key);
                const nodes = cell?.nodes ?? [];
                const day = itinerary.days[dayIndex];
                const colW = layout.columnWidths[dayIndex] ?? metrics.minColumnWidth;
                const colLeft = layout.columnOffsets[dayIndex] ?? 0;
                const rowH = layout.regionHeights.get(region) ?? 40;
                const isDropTarget =
                  dragPreview != null &&
                  dragPreview.targetRegion === region &&
                  dragPreview.dayIndex === dayIndex &&
                  dragPreview.targetRegion !== dragPreview.sourceRegion;
                const longNote = getCellLongNote(nodes);
                const cellLayout = cell?.cellLayout;

                return (
                  <div
                    key={key}
                    className={`overview-cell ${isDropTarget ? 'overview-cell--drop-target' : ''}`}
                    style={{
                      left: colLeft,
                      top: regionTop,
                      width: colW,
                      height: rowH,
                    }}
                  >
                    {nodes.length > 0 && cellLayout ? (
                      <div className="overview-cell__scroll">
                        <OverviewRouteChain
                          day={day}
                          nodes={nodes}
                          cellLayout={cellLayout}
                          compact={metrics.compact}
                          selectedNodeId={isExporting ? null : selectedNodeId}
                          dragPreview={dragPreview}
                          regionEnter={regionEnter}
                          primaryHotelIds={primaryHotelIds}
                          onSelectNode={(nodeId) => {
                            selectNode(nodeId);
                            setActiveDay(dayIndex);
                          }}
                          onOpenMap={(nodeId) => {
                            selectNode(nodeId);
                            setActiveDay(dayIndex);
                            setActiveView('map');
                          }}
                          onNodePointerDown={makeDragDown(
                            dayIndex,
                            region,
                            colW,
                            cellLayout,
                            nodes,
                          )}
                          onNodePointerUp={onNodePointerUp}
                        />
                      </div>
                    ) : null}
                    {longNote && (
                      <OverviewCellNote text={longNote} exportMode={isExporting} />
                    )}
                  </div>
                );
              });
            })}

            </div>
          </div>
        </div>

        <div className="overview-shell__legend itinerary-graph__legend">
          <span className="itinerary-graph__legend-item">
            <i className="itinerary-graph__line" />
            主路线
          </span>
          <span className="itinerary-graph__legend-item">
            <i className="itinerary-graph__line itinerary-graph__line--dashed" />
            备选项
          </span>
          <span className="itinerary-graph__legend-item">
            <i className="itinerary-graph__line itinerary-graph__line--region" />
            跨区
          </span>
          {!isExporting && (
            <span className="itinerary-graph__hint">
              拖拽调位/换区 · 拖表头边线调列宽 · 单击选中 · 双击地图
              {canUndo && ' · ⌘Z 撤销'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
