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
import type { DayPlan, ItineraryEdge, ItineraryNode, NodeCategory } from '../../types/itinerary';
import './TravelMap.css';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

const NODE_SOURCE = 'itinerary-nodes';
const NODE_CIRCLE = 'itinerary-nodes-circle';
const NODE_LABEL = 'itinerary-nodes-label';

const ROUTE_LAYER_IDS = ['route-primary', 'route-alt', 'route-cross-day'] as const;

function collectMapDays(
  itinerary: { days: DayPlan[] },
  graphViewMode: 'day' | 'overview',
  activeDayIndex: number,
): DayPlan[] {
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
    features: nodes.map((node) => ({
      type: 'Feature' as const,
      id: node.id,
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

function ensureNodeLayers(map: maplibregl.Map) {
  if (!map.isStyleLoaded() || map.getSource(NODE_SOURCE)) return;

  map.addSource(NODE_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

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

export function TravelMap({ visible = true }: { visible?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const lastFitKeyRef = useRef<string | null>(null);
  const pendingFitRef = useRef(false);
  const pickMarkerRef = useRef<maplibregl.Marker | null>(null);
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
    () => (itinerary ? collectMapDays(itinerary, graphViewMode, activeDayIndex) : []),
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
    if (!itinerary) return '';
    const dayKey = mapDays.map((d) => d.day_index).join(',');
    const coordKey = mappableNodes
      .map((n) => `${n.id}:${n.lat.toFixed(5)},${n.lng.toFixed(5)}`)
      .join('|');
    return `${graphViewMode}:${activeDayIndex}:${dayKey}:${coordKey}`;
  }, [itinerary, graphViewMode, activeDayIndex, mapDays, mappableNodes]);

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
      const isSingle =
        nodes.length === 1 ||
        (nodes.length > 1 &&
          nodes.every(
            (n) =>
              Math.abs(n.lat - nodes[0].lat) < 1e-6 && Math.abs(n.lng - nodes[0].lng) < 1e-6,
          ));
      if (isSingle) {
        const n = nodes[0];
        map.easeTo({
          center: [n.displayLng, n.displayLat],
          zoom: 14,
          duration: animate ? 600 : 0,
        });
      } else {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
          duration: animate ? 600 : 0,
        });
      }
      pendingFitRef.current = false;
    },
    [],
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
    };

    const unbindStyleReady = whenMapStyleReady(map, onLoad);

    return () => {
      unbindStylePatches();
      unbindStyleReady();
      mapReadyRef.current = false;
      setMapReady(false);
      nodeHandlersBoundRef.current = false;
      clearPickMarker();
      map.remove();
      mapRef.current = null;
      lastFitKeyRef.current = null;
      pendingFitRef.current = false;
    };
  }, [bindNodeLayerHandlers, clearPickMarker]);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;

    const ro = new ResizeObserver(() => {
      map.resize();
      if (pendingFitRef.current && mapReadyRef.current) {
        const nodes = mappableNodes;
        if (nodes.length > 0) {
          fitToNodes(map, spreadMapNodes(nodes), false);
          lastFitKeyRef.current = fitKey;
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitKey, fitToNodes, mappableNodes]);

  // 路线图层
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !itinerary || mapDays.length === 0) return;

    let cancelled = false;

    const syncRoutes = () => {
      if (cancelled || !map.isStyleLoaded()) return;

      ROUTE_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });

      const nodeMap = new Map<string, ItineraryNode>();
      itinerary.days.forEach((day) => {
        day.nodes.forEach((n) => nodeMap.set(n.id, n));
      });

      const allEdges: ItineraryEdge[] = [];
      mapDays.forEach((day) => allEdges.push(...day.edges));

      const dayNodeIds =
        graphViewMode === 'day' && mapDays[0]
          ? new Set(mapDays[0].nodes.map((n) => n.id))
          : null;

      (itinerary.cross_day_edges ?? []).forEach((edge) => {
        if (graphViewMode === 'overview') {
          allEdges.push(edge);
          return;
        }
        if (dayNodeIds && (dayNodeIds.has(edge.from) || dayNodeIds.has(edge.to))) {
          allEdges.push(edge);
        }
      });

      const addRoutes = (
        edges: ItineraryEdge[],
        sourceId: string,
        color: string,
        width: number,
        opacity: number,
        dash?: number[],
      ) => {
        const features = edges
          .map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to || !hasMapCoords(from) || !hasMapCoords(to)) return null;
            return {
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: [
                  [from.lng, from.lat],
                  [to.lng, to.lat],
                ],
              },
            };
          })
          .filter(Boolean);

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

      const crossDayIds = new Set((itinerary.cross_day_edges ?? []).map((e) => e.id));
      const primaryEdges = allEdges.filter((e) => e.type === 'primary' && !crossDayIds.has(e.id));
      const altEdges = allEdges.filter((e) => e.type === 'alternative' && !crossDayIds.has(e.id));
      const crossEdges = allEdges.filter((e) => crossDayIds.has(e.id));

      addRoutes(primaryEdges, 'route-primary', '#4a9eff', 3, 0.85);
      addRoutes(altEdges, 'route-alt', '#64748b', 2, 0.5, [2, 2]);
      addRoutes(crossEdges, 'route-cross-day', '#a78bfa', 2, 0.7, [4, 3]);
    };

    const unbindStyleReady = whenMapStyleReady(map, syncRoutes);

    return () => {
      cancelled = true;
      unbindStyleReady();
    };
  }, [mapDays, itinerary, graphViewMode]);

  // 节点：GeoJSON 图层（与底图同一坐标系，缩放不漂移）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const syncNodes = () => {
      if (cancelled || !map.isStyleLoaded()) return;

      ensureNodeLayers(map);
      const source = map.getSource(NODE_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;

      source.setData(nodesGeoJSON);

      if (fitKey && fitKey !== lastFitKeyRef.current) {
        if (visible) {
          fitToNodes(map, displayNodes, lastFitKeyRef.current != null);
          lastFitKeyRef.current = fitKey;
        } else {
          pendingFitRef.current = true;
          lastFitKeyRef.current = fitKey;
        }
      }
    };

    const unbindStyleReady = whenMapStyleReady(map, syncNodes);

    return () => {
      cancelled = true;
      unbindStyleReady();
    };
  }, [nodesGeoJSON, displayNodes, fitKey, fitToNodes, visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const syncStayZones = () => {
      if (cancelled || !map.isStyleLoaded()) return;
      ensureNodeLayers(map);
      updateStayZoneSource(map, stayZones, selectedStayZoneId, NODE_CIRCLE);
    };

    const unbindStyleReady = whenMapStyleReady(map, syncStayZones);

    return () => {
      cancelled = true;
      unbindStyleReady();
    };
  }, [stayZones, selectedStayZoneId]);

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

  // 从路线图切回地图：强制 resize（visibility 切换不一定触发 ResizeObserver）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (visible && !wasVisibleRef.current) {
      const frame = requestAnimationFrame(() => {
        map.resize();
        if (displayNodes.length > 0 && pendingFitRef.current) {
          fitToNodes(map, displayNodes, false);
          lastFitKeyRef.current = fitKey;
        }
      });
      wasVisibleRef.current = true;
      return () => cancelAnimationFrame(frame);
    }

    if (!visible) {
      wasVisibleRef.current = false;
    }
  }, [visible, mapReady, fitKey, displayNodes, fitToNodes]);

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
      {!isPickMode && mappableNodes.length > 0 && (
        <span className="travel-map__mode-badge travel-map__mode-badge--count">
          {graphViewMode === 'overview'
            ? `共 ${mappableNodes.length} 个节点`
            : `第 ${activeDayIndex + 1} 天 · ${mappableNodes.length} 个节点`}
        </span>
      )}
      {graphViewMode === 'overview' && !isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--sub">总览 · 全部天数</span>
      )}
      {graphViewMode === 'day' && !isPickMode && (
        <span className="travel-map__mode-badge travel-map__mode-badge--sub">
          单日模式 · 切换总览可看全部
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
