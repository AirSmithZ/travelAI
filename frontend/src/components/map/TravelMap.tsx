import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { usePlanStore, findNodeContext, selectActiveItinerary, selectActivePlan } from '../../stores/usePlanStore';
import { geocodeReverse } from '../../api/geocode';
import { CATEGORY_META } from '../../data/categoryTokens';
import { buildNodeCoordsPatch } from '../../utils/applyNodeCoords';
import { hasMapCoords } from '../../utils/mapCoords';
import { countOverlappingNodes, spreadMapNodes, type MapDisplayNode } from '../../utils/spreadMapNodes';
import { bindMapStylePatches, MAP_LABEL_FONT, whenMapStyleReady } from '../../utils/mapStylePatches';
import {
  STAY_ZONE_FILL,
  updateStayZoneSource,
} from '../../utils/stayZoneGeoJSON';
import {
  clearStayHotelDomMarkers,
  syncStayHotelDomMarkers,
  type StayHotelMapPin,
} from '../../utils/stayHotelMapPins';
import { isValidMapCoord } from '../../utils/mapCoordGuards';
import type { DayPlan, ItineraryEdge, ItineraryNode, NodeCategory } from '../../types/itinerary';
import type { RecommendedStayZone } from '../../types/stayZone';
import './TravelMap.css';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

const NODE_SOURCE = 'itinerary-nodes';
const NODE_CIRCLE = 'itinerary-nodes-circle';
const NODE_CLUSTER = 'itinerary-nodes-cluster';
const NODE_CLUSTER_COUNT = 'itinerary-nodes-cluster-count';
const NODE_LABEL = 'itinerary-nodes-label';

const ROUTE_LAYER_IDS = ['route-primary', 'route-alt', 'route-cross-day'] as const;

function collectMapDays(
  itinerary: { days: DayPlan[] },
  graphViewMode: 'day' | 'overview',
  activeDayIndex: number,
): DayPlan[] {
  // 总览：全部天；单日：仅当前 DayTabs 选中天（设计文档 §3.3.1）
  if (graphViewMode === 'overview') return itinerary.days;
  const day = itinerary.days[activeDayIndex];
  return day ? [day] : [];
}

function collectVisibleNodes(mapDays: DayPlan[]): ItineraryNode[] {
  const nodes: ItineraryNode[] = [];
  mapDays.forEach((day) => {
    day.nodes.forEach((n) => nodes.push(n));
  });
  return nodes;
}

function categoryColor(category: string): string {
  const meta = CATEGORY_META[category as NodeCategory];
  return meta?.color ?? '#6366d4';
}

function buildNodesGeoJSON(
  nodes: MapDisplayNode[],
  selectedNodeId: string | null,
) {
  return {
    type: 'FeatureCollection' as const,
    features: nodes.map((node, index) => ({
      type: 'Feature' as const,
      // Numeric Feature.id avoids MapLibre string-id / duplicate-id drop quirks;
      // app id stays in properties for click handlers.
      id: index + 1,
      properties: {
        id: node.id,
        name: node.overlapCount > 1 ? `${node.name} (${node.overlapCount}处重合)` : node.name,
        category: node.category,
        color: categoryColor(node.category),
        selected: node.id === selectedNodeId,
        optional: node.is_optional,
        overlap: node.overlapCount > 1,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [node.displayLng, node.displayLat] as [number, number],
      },
    })),
  };
}

/** Only edges whose both ends are in the current mappable day set (no orphan segments). */
function buildDayRouteFeatures(
  edges: ItineraryEdge[],
  displayById: Map<string, MapDisplayNode>,
) {
  return edges
    .map((edge) => {
      const from = displayById.get(edge.from);
      const to = displayById.get(edge.to);
      if (!from || !to) return null;
      if (from.id === to.id) return null;
      return {
        type: 'Feature' as const,
        properties: { edgeId: edge.id },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [from.displayLng, from.displayLat],
            [to.displayLng, to.displayLat],
          ],
        },
      };
    })
    .filter(Boolean);
}

function bringNodeLayersToFront(map: maplibregl.Map) {
  try {
    if (map.getLayer(NODE_CIRCLE)) map.moveLayer(NODE_CIRCLE);
    if (map.getLayer(NODE_LABEL)) map.moveLayer(NODE_LABEL);
  } catch {
    /* ignore */
  }
}

function wipeNodeLayersAndSource(map: maplibregl.Map) {
  for (const id of [NODE_LABEL, NODE_CIRCLE, NODE_CLUSTER_COUNT, NODE_CLUSTER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(NODE_SOURCE)) map.removeSource(NODE_SOURCE);
}

function nodeSourceIsClustered(map: maplibregl.Map): boolean {
  const spec = map.getStyle()?.sources?.[NODE_SOURCE];
  return Boolean(spec && spec.type === 'geojson' && 'cluster' in spec && spec.cluster);
}

function ensureNodeLayers(map: maplibregl.Map) {
  if (!map.isStyleLoaded()) return;

  // P81/P86: clustering off. Legacy path only tore down when NODE_CLUSTER layer
  // still existed — HMR/style glitches could leave cluster:true source + no
  // cluster layers → circle filter excluded every point at city zoom (badge>0, 0 pins).
  const legacyClusterLayers =
    Boolean(map.getLayer(NODE_CLUSTER)) || Boolean(map.getLayer(NODE_CLUSTER_COUNT));
  if (legacyClusterLayers || nodeSourceIsClustered(map)) {
    wipeNodeLayersAndSource(map);
  }

  if (!map.getSource(NODE_SOURCE)) {
    map.addSource(NODE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: false,
    });
  }

  if (!map.getLayer(NODE_CIRCLE)) {
    map.addLayer({
      id: NODE_CIRCLE,
      type: 'circle',
      source: NODE_SOURCE,
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          12,
          ['case', ['boolean', ['get', 'overlap'], false], 10, 9],
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': ['case', ['boolean', ['get', 'optional'], false], 0.78, 1],
      },
    });
  }

  if (!map.getLayer(NODE_LABEL)) {
    map.addLayer({
      id: NODE_LABEL,
      type: 'symbol',
      source: NODE_SOURCE,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-font': [...MAP_LABEL_FONT],
        'text-offset': [0, -1.8],
        'text-anchor': 'bottom',
        'text-max-width': 9,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#e2e8f0',
        'text-halo-color': 'rgba(12, 18, 25, 0.92)',
        'text-halo-width': 1.2,
      },
    });
  }
}

function clearRouteLayers(map: maplibregl.Map) {
  ROUTE_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
}

export function TravelMap({ visible = true }: { visible?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const lastFitKeyRef = useRef<string | null>(null);
  const pendingFitRef = useRef(false);
  const pickMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stayHotelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const nodeHandlersBoundRef = useRef(false);
  const wasVisibleRef = useRef(false);

  const [pickPreview, setPickPreview] = useState<{
    lat: number;
    lng: number;
    address?: string;
    loadingAddress: boolean;
  } | null>(null);

  const itinerary = usePlanStore(selectActiveItinerary);
  const plan = usePlanStore(selectActivePlan);
  const stayZones = useMemo(
    () => plan.travel_intel.recommended_stay_zones ?? [],
    [plan.travel_intel.recommended_stay_zones],
  );
  const stayHotelMapPins = usePlanStore((s) => s.stayHotelMapPins);
  const selectedStayZoneId = usePlanStore((s) => s.selectedStayZoneId);
  const setSelectedStayZoneId = usePlanStore((s) => s.setSelectedStayZoneId);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const graphViewMode = usePlanStore((s) => s.graphViewMode);
  const selectedNodeId = usePlanStore((s) => s.selectedNodeId);
  const mapPickNodeId = usePlanStore((s) => s.mapPickNodeId);
  const isGeocodingItinerary = usePlanStore((s) => s.isGeocodingItinerary);
  const selectNode = usePlanStore((s) => s.selectNode);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const cancelMapPick = usePlanStore((s) => s.cancelMapPick);
  const updateNode = usePlanStore((s) => s.updateNode);

  const pickNode = useMemo(() => {
    if (!itinerary || !mapPickNodeId) return null;
    const ctx = findNodeContext(itinerary, mapPickNodeId);
    return ctx?.node ?? null;
  }, [itinerary, mapPickNodeId]);

  const isPickMode = Boolean(mapPickNodeId && pickNode);

  const mapDays = useMemo(
    () =>
      itinerary ? collectMapDays(itinerary, graphViewMode, activeDayIndex) : [],
    [itinerary, graphViewMode, activeDayIndex],
  );

  const visibleNodes = useMemo(() => collectVisibleNodes(mapDays), [mapDays]);

  const mappableNodes = useMemo(
    () => visibleNodes.filter(hasMapCoords),
    [visibleNodes],
  );

  const displayNodes = useMemo(
    () => spreadMapNodes(mappableNodes),
    [mappableNodes],
  );

  const overlapExtra = useMemo(
    () => countOverlappingNodes(mappableNodes),
    [mappableNodes],
  );

  const nodesGeoJSON = useMemo(
    () => buildNodesGeoJSON(displayNodes, selectedNodeId),
    [displayNodes, selectedNodeId],
  );

  const fitKey = useMemo(() => {
    if (!itinerary) {
      const zoneKey = stayZones
        .filter((z) => z.geometry && z.status !== 'rejected')
        .map((z) => z.id)
        .join(',');
      const pinKey = stayHotelMapPins
        .map((p) => `${p.id}:${p.selected ? 1 : 0}:${p.lat.toFixed(4)}`)
        .join('|');
      return `stay:${selectedStayZoneId ?? ''}:${zoneKey}:${pinKey}`;
    }
    const dayKey = mapDays.map((d) => d.day_index).join(',');
    const nodeKey = mappableNodes.map((n) => n.id).join(',');
    const coordKey = mappableNodes
      .map((n) => `${n.id}:${n.lat.toFixed(5)},${n.lng.toFixed(5)}`)
      .join('|');
    return `${graphViewMode}:${activeDayIndex}:${dayKey}:${nodeKey}:${coordKey}`;
  }, [
    itinerary,
    graphViewMode,
    activeDayIndex,
    mapDays,
    mappableNodes,
    stayZones,
    stayHotelMapPins,
    selectedStayZoneId,
  ]);

  const clearPickMarker = useCallback(() => {
    pickMarkerRef.current?.remove();
    pickMarkerRef.current = null;
  }, []);

  const fitToNodes = useCallback(
    (map: maplibregl.Map, nodes: MapDisplayNode[], animate: boolean) => {
      const container = containerRef.current;
      if (!container || container.clientWidth < 2 || container.clientHeight < 2) {
        pendingFitRef.current = true;
        return;
      }
      const bounds = new maplibregl.LngLatBounds();
      nodes.forEach((node) => bounds.extend([node.displayLng, node.displayLat]));
      if (bounds.isEmpty()) return;
      const isSingle = nodes.length === 1;
      if (isSingle) {
        const n = nodes[0];
        map.easeTo({
          center: [n.displayLng, n.displayLat],
          zoom: 15,
          duration: animate ? 600 : 0,
        });
      } else {
        // Always fitBounds when multiple display pins (incl. spread-apart overlaps)
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 16,
          duration: animate ? 600 : 0,
        });
      }
      pendingFitRef.current = false;
    },
    [],
  );

  /** P100/P108: 无行程节点时 fit 片区 + 酒店候选钉；@returns 是否完成 fit */
  const fitToStayPreview = useCallback(
    (
      map: maplibregl.Map,
      zones: RecommendedStayZone[],
      pins: StayHotelMapPin[],
      animate: boolean,
    ): boolean => {
      const container = containerRef.current;
      if (!container || container.clientWidth < 2 || container.clientHeight < 2) {
        pendingFitRef.current = true;
        return false;
      }
      const bounds = new maplibregl.LngLatBounds();
      let any = false;

      const preferZoneId = selectedStayZoneId;
      const zoneList =
        preferZoneId && zones.some((z) => z.id === preferZoneId)
          ? zones.filter((z) => z.id === preferZoneId)
          : zones;

      for (const z of zoneList) {
        if (z.status === 'rejected' || !z.geometry) continue;
        if (z.geometry.type === 'circle') {
          const lat = Number(z.geometry.center.lat);
          const lng = Number(z.geometry.center.lng);
          if (!isValidMapCoord(lat, lng)) continue;
          const r = Math.max(z.geometry.radius_m, 400);
          const dLat = r / 111_320;
          const dLng = r / Math.max(Math.abs(111_320 * Math.cos((lat * Math.PI) / 180)), 1e-3);
          bounds.extend([lng - dLng, lat - dLat]);
          bounds.extend([lng + dLng, lat + dLat]);
          any = true;
        } else {
          for (const [lngRaw, latRaw] of z.geometry.coordinates) {
            const lat = Number(latRaw);
            const lng = Number(lngRaw);
            if (!isValidMapCoord(lat, lng)) continue;
            bounds.extend([lng, lat]);
            any = true;
          }
        }
      }
      for (const p of pins) {
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        if (!isValidMapCoord(lat, lng)) continue;
        bounds.extend([lng, lat]);
        any = true;
      }
      if (!any || bounds.isEmpty()) return false;

      // Guard against null-island contamination → world view
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      if (ne.lng - sw.lng > 8 || ne.lat - sw.lat > 8) {
        const focus = pins.find((p) => isValidMapCoord(Number(p.lat), Number(p.lng)));
        if (focus) {
          map.easeTo({
            center: [Number(focus.lng), Number(focus.lat)],
            zoom: 14,
            duration: animate ? 600 : 0,
          });
          pendingFitRef.current = false;
          return true;
        }
        return false;
      }

      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 15,
        duration: animate ? 600 : 0,
      });
      pendingFitRef.current = false;
      return true;
    },
    [selectedStayZoneId],
  );

  const bindNodeLayerHandlers = useCallback(
    (map: maplibregl.Map) => {
      if (nodeHandlersBoundRef.current) return;
      nodeHandlersBoundRef.current = true;

      const onNodeClick = (e: MapLayerMouseEvent) => {
        if (usePlanStore.getState().mapPickNodeId) return;
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') selectNode(id);
      };

      const onEnter = () => {
        if (!usePlanStore.getState().mapPickNodeId) {
          map.getCanvas().style.cursor = 'pointer';
        }
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = '';
      };

      map.on('click', NODE_CIRCLE, onNodeClick);
      map.on('mouseenter', NODE_CIRCLE, onEnter);
      map.on('mouseleave', NODE_CIRCLE, onLeave);
    },
    [selectNode],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [103.86, 1.29],
      zoom: 11,
      attributionControl: false,
      localIdeographFontFamily: "'Noto Sans SC', 'Noto Sans Regular', sans-serif",
    });

    const unbindStylePatches = bindMapStylePatches(map);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const onLoad = () => {
      if (!map.isStyleLoaded()) return;
      if (mapReadyRef.current) return;
      mapReadyRef.current = true;
      setMapReady(true);
      ensureNodeLayers(map);
      bindNodeLayerHandlers(map);
      map.resize();
      // Style async load can leave camera at 0,0 — reassert constructor center until stay fit runs
      map.jumpTo({ center: [103.86, 1.29], zoom: 11 });
      pendingFitRef.current = true;
    };

    const unbindStyleReady = whenMapStyleReady(map, onLoad);

    return () => {
      unbindStylePatches();
      unbindStyleReady();
      mapReadyRef.current = false;
      setMapReady(false);
      nodeHandlersBoundRef.current = false;
      clearPickMarker();
      clearStayHotelDomMarkers(stayHotelMarkersRef.current);
      stayHotelMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      lastFitKeyRef.current = null;
      pendingFitRef.current = false;
    };
  }, [bindNodeLayerHandlers, clearPickMarker]);

  /** @returns false if style not ready — caller must not advance lastFitKeyRef */
  const syncMapData = useCallback(
    (opts?: { fit?: boolean; animateFit?: boolean }): boolean => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return false;

      try {
        ensureNodeLayers(map);
        const source = map.getSource(NODE_SOURCE) as GeoJSONSource | undefined;
        if (source) source.setData(nodesGeoJSON);

        clearRouteLayers(map);

        const displayById = new Map(displayNodes.map((n) => [n.id, n]));
        // Build routes per day so id collisions across days don't invent orphan segments
        const primaryEdges: ItineraryEdge[] = [];
        const altEdges: ItineraryEdge[] = [];
        for (const day of mapDays) {
          const dayIds = new Set(day.nodes.map((n) => n.id));
          const dayDisplay = new Map(
            [...displayById.entries()].filter(([id]) => dayIds.has(id)),
          );
          for (const edge of day.edges) {
            if (!dayDisplay.has(edge.from) || !dayDisplay.has(edge.to)) continue;
            if (edge.type === 'alternative') altEdges.push(edge);
            else primaryEdges.push(edge);
          }
        }

        const addRoutes = (
          edges: ItineraryEdge[],
          sourceId: string,
          color: string,
          width: number,
          opacity: number,
          dash?: number[],
        ) => {
          const features = buildDayRouteFeatures(edges, displayById);
          if (features.length === 0) return;

          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
          });
          map.addLayer(
            {
              id: sourceId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': color,
                'line-width': width,
                'line-opacity': opacity,
                ...(dash ? { 'line-dasharray': dash } : {}),
              },
            },
            map.getLayer(NODE_CIRCLE) ? NODE_CIRCLE : undefined,
          );
        };

        addRoutes(primaryEdges, 'route-primary', '#4a9eff', 3, 0.85);
        addRoutes(altEdges, 'route-alt', '#64748b', 2, 0.5, [2, 2]);

        if (graphViewMode === 'overview' && itinerary) {
          const cross = (itinerary.cross_day_edges ?? []).filter(
            (e) => displayById.has(e.from) && displayById.has(e.to),
          );
          addRoutes(cross, 'route-cross-day', '#a78bfa', 2, 0.7, [4, 3]);
        }

        const zonesOk = updateStayZoneSource(
          map,
          stayZones,
          selectedStayZoneId,
          NODE_CIRCLE,
        );
        // P108/P109: 酒店候选用 DOM Marker；点击回写 store 供住宿面板选中
        stayHotelMarkersRef.current = syncStayHotelDomMarkers(
          map,
          stayHotelMapPins,
          stayHotelMarkersRef.current,
          (pin) => usePlanStore.getState().requestStayHotelMapPinPick(pin.id),
        );
        const pinsOk =
          stayHotelMapPins.length === 0 || stayHotelMarkersRef.current.length > 0;
        if (!zonesOk && !pinsOk && stayHotelMapPins.length > 0) return false;

        bringNodeLayersToFront(map);

        if (opts?.fit) {
          if (displayNodes.length > 0) {
            fitToNodes(map, displayNodes, Boolean(opts.animateFit));
            lastFitKeyRef.current = fitKey;
            pendingFitRef.current = false;
          } else if (stayZones.some((z) => z.geometry) || stayHotelMapPins.length > 0) {
            const fitted = fitToStayPreview(
              map,
              stayZones,
              stayHotelMapPins,
              Boolean(opts.animateFit),
            );
            // P107: 容器尚未布局时勿推进 fitKey / 勿清 pending，等 resize 重试
            if (fitted) {
              lastFitKeyRef.current = fitKey;
            } else {
              pendingFitRef.current = true;
            }
          }
        }
        return zonesOk || pinsOk || stayHotelMapPins.length === 0;
      } catch {
        return false;
      }
    },
    [
      nodesGeoJSON,
      displayNodes,
      mapDays,
      graphViewMode,
      itinerary,
      stayZones,
      stayHotelMapPins,
      selectedStayZoneId,
      fitToNodes,
      fitToStayPreview,
      fitKey,
    ],
  );

  const hasStayOverlay =
    stayHotelMapPins.length > 0 || stayZones.some((z) => Boolean(z.geometry));

  // 节点 + 当日路线：随天切换 / 坐标变化同步
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    const run = () => {
      if (cancelled) return;
      if (!visible) {
        pendingFitRef.current = true;
        return;
      }
      const shouldFit = Boolean(fitKey && fitKey !== lastFitKeyRef.current);
      const ok = syncMapData({
        fit: shouldFit || pendingFitRef.current,
        animateFit: shouldFit && lastFitKeyRef.current != null,
      });
      if ((!ok || pendingFitRef.current) && retries < 12) {
        // P107: style/尺寸瞬时空窗时短重试，避免「角标有 8 家、底图无钉」
        retries += 1;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (cancelled) return;
          map.resize();
          run();
        }, 100);
      }
    };

    const unbindStyleReady = whenMapStyleReady(map, run);
    // mapReady 后若 style 已可写，再跑一轮（覆盖 whenMapStyleReady 一次性 settled）
    const raf = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      unbindStyleReady();
      cancelAnimationFrame(raf);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [syncMapData, visible, fitKey, mapReady]);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;

    const ro = new ResizeObserver(() => {
      map.resize();
      if (!mapReadyRef.current) return;
      // P107: 尺寸变化时重写片区/酒店层（0→有尺寸时勿只 resize）
      if (pendingFitRef.current || hasStayOverlay) {
        syncMapData({ fit: true, animateFit: false });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [syncMapData, hasStayOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const onZoneClick = (e: MapLayerMouseEvent) => {
      if (usePlanStore.getState().mapPickNodeId) return;
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') setSelectedStayZoneId(id);
    };

    const onEnter = () => {
      if (!usePlanStore.getState().mapPickNodeId) {
        map.getCanvas().style.cursor = 'pointer';
      }
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', STAY_ZONE_FILL, onZoneClick);
    map.on('mouseenter', STAY_ZONE_FILL, onEnter);
    map.on('mouseleave', STAY_ZONE_FILL, onLeave);

    return () => {
      map.off('click', STAY_ZONE_FILL, onZoneClick);
      map.off('mouseenter', STAY_ZONE_FILL, onEnter);
      map.off('mouseleave', STAY_ZONE_FILL, onLeave);
    };
  }, [mapReady, setSelectedStayZoneId]);

  // 从路线图切回地图：resize + 强制按当前天重绘（避免隐藏期间旧图层残留）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (visible && !wasVisibleRef.current) {
      const frame = requestAnimationFrame(() => {
        map.resize();
        syncMapData({ fit: true, animateFit: false });
      });
      wasVisibleRef.current = true;
      return () => cancelAnimationFrame(frame);
    }

    if (!visible) {
      wasVisibleRef.current = false;
      pendingFitRef.current = true;
    }
  }, [visible, mapReady, syncMapData]);

  // 选点模式
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isPickMode) {
      setPickPreview(null);
      clearPickMarker();
      return;
    }

    setPickPreview(null);
    clearPickMarker();
    map.getCanvas().style.cursor = 'crosshair';

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      setPickPreview({ lat, lng, loadingAddress: true });

      if (!pickMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'map-pick-marker';
        pickMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' });
      }
      pickMarkerRef.current.setLngLat([lng, lat]).addTo(map);

      geocodeReverse(lat, lng)
        .then((result) => {
          setPickPreview((prev) =>
            prev && prev.lat === lat && prev.lng === lng
              ? {
                  lat,
                  lng,
                  address: result?.address || undefined,
                  loadingAddress: false,
                }
              : prev,
          );
        })
        .catch(() => {
          setPickPreview((prev) =>
            prev && prev.lat === lat && prev.lng === lng
              ? { lat, lng, loadingAddress: false }
              : prev,
          );
        });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      map.getCanvas().style.cursor = '';
    };
  }, [isPickMode, clearPickMarker]);

  useEffect(() => {
    if (!isPickMode) {
      setPickPreview(null);
      clearPickMarker();
    }
  }, [isPickMode, clearPickMarker]);

  const handleConfirmPick = () => {
    if (!pickPreview || !mapPickNodeId || !itinerary) return;
    const ctx = findNodeContext(itinerary, mapPickNodeId);
    if (!ctx) return;
    updateNode(
      ctx.dayIndex,
      mapPickNodeId,
      buildNodeCoordsPatch(pickPreview.lat, pickPreview.lng, {
        address: pickPreview.address,
        source: 'map_pick',
      }),
    );
    setPickPreview(null);
    clearPickMarker();
    cancelMapPick();
  };

  const handleCancelPick = () => {
    setPickPreview(null);
    clearPickMarker();
    cancelMapPick();
  };

  const pendingCoords =
    !isPickMode && visibleNodes.length > 0 && mappableNodes.length < visibleNodes.length;

  return (
    <div
      className={`travel-map${isPickMode ? ' travel-map--pick-mode' : ''}${visible ? '' : ' travel-map--hidden'}`}
    >
      <div ref={containerRef} className="travel-map__container" />
      {/* UX-GEN-02 */}
      {visible && !mapReady && (
        <div className="travel-map__skeleton" aria-hidden>
          <div className="travel-map__skeleton-bar" />
          <div className="travel-map__skeleton-bar travel-map__skeleton-bar--short" />
          <div className="travel-map__skeleton-map" />
        </div>
      )}
      {visible && (
        <p className="travel-map__attrib">
          <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
            © OpenFreeMap
          </a>
          {' · '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            © OpenStreetMap
          </a>
        </p>
      )}
      {!isPickMode && Boolean(itinerary?.days?.length) && mappableNodes.length > 0 && (
        <span className="travel-map__mode-badge travel-map__mode-badge--count">
          {graphViewMode === 'overview'
            ? `总览 · 共 ${mappableNodes.length} 个节点`
            : `第 ${activeDayIndex + 1} 天 · ${mappableNodes.length} 个节点`}
        </span>
      )}
      {!isPickMode && !itinerary?.days?.length && (
        <span className="travel-map__mode-badge travel-map__mode-badge--count">
          {stayHotelMapPins.length > 0
            ? `住宿预览 · ${stayHotelMapPins.length} 家候选`
            : '住宿预览 · 片区范围'}
        </span>
      )}
      {!isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--sub">
          {!itinerary?.days?.length
            ? '选酒店时显示片区圈与候选钉'
            : graphViewMode === 'overview'
              ? '总览地图 · 展示全部行程天'
              : '单日地图 · 用上方日期切换'}
        </span>
      )}
      {overlapExtra > 0 && !isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--overlap">
          {overlapExtra} 个节点坐标重合，已散开显示
        </span>
      )}
      {isGeocodingItinerary && !isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--geocode">
          坐标补全中…
        </span>
      )}
      {!isGeocodingItinerary && pendingCoords && !isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--warn">
          {mappableNodes.length}/{visibleNodes.length} 个节点有坐标
        </span>
      )}
      {isPickMode && pickNode && (
        <div className="travel-map__pick-banner">
          <span className="travel-map__pick-label">
            选点模式 · 点击地图为「{pickNode.name}」定位
          </span>
          <button type="button" className="form-btn form-btn--sm" onClick={handleCancelPick}>
            取消
          </button>
        </div>
      )}
      {isPickMode && pickPreview && (
        <div className="travel-map__pick-confirm">
          <div className="travel-map__pick-info">
            <p className="travel-map__pick-coord">
              {pickPreview.lat.toFixed(5)}, {pickPreview.lng.toFixed(5)}
            </p>
            {pickPreview.loadingAddress ? (
              <p className="travel-map__pick-addr">正在解析地址…</p>
            ) : pickPreview.address ? (
              <p className="travel-map__pick-addr">{pickPreview.address}</p>
            ) : null}
          </div>
          <div className="travel-map__pick-actions">
            <button type="button" className="form-btn form-btn--sm" onClick={handleCancelPick}>
              取消
            </button>
            <button
              type="button"
              className="form-btn form-btn--primary form-btn--sm"
              onClick={handleConfirmPick}
            >
              确认坐标
            </button>
          </div>
        </div>
      )}
      {selectedNodeId && !isPickMode && (
        <button
          type="button"
          className="travel-map__back-hint"
          onClick={() => setActiveView('graph')}
        >
          ← 返回路线图
        </button>
      )}
    </div>
  );
}
