import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DayPlan, TripEdge } from '../types';
import { categoryMeta } from '../types';
import { accuracyRing, buildMapModel, emptyCollection } from '../trip';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

function ToolIcon({ name }: { name: 'locate' | 'in' | 'out' | 'fit' | 'fold' | 'unfold' }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {name === 'locate' ? (
        <>
          <circle cx="9" cy="9" r="2.5" {...stroke} />
          <path d="M9 1.75v2.25M9 13.75v2.5M1.75 9h2.25M14 9h2.25" {...stroke} />
        </>
      ) : null}
      {name === 'in' ? <path d="M9 4.25v9.5M4.25 9h9.5" {...stroke} /> : null}
      {name === 'out' ? <path d="M4.25 9h9.5" {...stroke} /> : null}
      {name === 'fit' ? <path d="M3.5 6.5V3.5H6.5M11.5 3.5h3v3M14.5 11.5v3h-3M6.5 14.5h-3v-3" {...stroke} /> : null}
      {name === 'fold' ? <path d="M7 4.25 11.75 9 7 13.75" {...stroke} /> : null}
      {name === 'unfold' ? <path d="M11 4.25 6.25 9 11 13.75" {...stroke} /> : null}
    </svg>
  );
}

const LABEL_FONT = ['Noto Sans Regular'];

const RASTER_STYLE = {
  version: 8 as const,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    basemap: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'basemap', type: 'raster' as const, source: 'basemap' }],
};

interface TripMapProps {
  active: boolean;
  days: DayPlan[];
  crossEdges: TripEdge[];
  includeCross: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Fix {
  lng: number;
  lat: number;
  accuracy: number;
}

export function TripMap({ active, days, crossEdges, includeCross, selectedId, onSelect }: TripMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const watchRef = useRef<number | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const flew = useRef(false);
  const [ready, setReady] = useState(false);
  const [styleError, setStyleError] = useState(false);
  const [locState, setLocState] = useState<'off' | 'wait' | 'on' | 'denied' | 'error'>('off');
  const [locNote, setLocNote] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [toolsOpen, setToolsOpen] = useState(true);
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  onSelectRef.current = onSelect;

  const model = useMemo(
    () => buildMapModel(days, crossEdges, includeCross, selectedId, (category) => categoryMeta(category).color),
    [days, crossEdges, includeCross, selectedId],
  );

  const fitKey = days.map((day) => day.day_index).join(',');
  const boundsKey = model.located.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(';');

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.width = 'auto';
    container.style.height = 'auto';
    let dead = false;
    let usedFallback = false;
    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [145.5, -37.8],
      zoom: 3.2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 0,
      maxPitch: 0,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    mapRef.current = map;

    const mountLayers = () => {
      if (dead || map.getSource('nodes')) return;
      map.addSource('lines-main', { type: 'geojson', data: emptyCollection() });
      map.addSource('lines-alt', { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'lines-main',
        type: 'line',
        source: 'lines-main',
        paint: { 'line-color': '#4a9eff', 'line-width': 2.5, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'lines-alt',
        type: 'line',
        source: 'lines-alt',
        paint: {
          'line-color': '#8b9cb0',
          'line-width': 2,
          'line-dasharray': [1.4, 1.2],
          'line-opacity': 0.85,
        },
      });
      map.addSource('user-acc', { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'user-acc',
        type: 'fill',
        source: 'user-acc',
        paint: { 'fill-color': '#4a9eff', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'user-acc-line',
        type: 'line',
        source: 'user-acc',
        paint: { 'line-color': '#4a9eff', 'line-width': 1 },
      });
      map.addSource('nodes', { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'nodes',
        type: 'circle',
        source: 'nodes',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 10, 12, 14, 15, 16],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['==', ['get', 'optional'], 1], 0.5, 0.95],
          'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 1.4],
          'circle-stroke-color': '#e8edf4',
        },
      });
      map.addLayer({
        id: 'node-labels',
        type: 'symbol',
        source: 'nodes',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 13, 13, 14],
          'text-font': LABEL_FONT,
          'text-offset': [0, -1.35],
          'text-anchor': 'bottom',
          'text-max-width': 10,
          'text-padding': 2,
          'text-allow-overlap': ['step', ['zoom'], false, 10.5, true],
          'text-ignore-placement': ['step', ['zoom'], false, 10.5, true],
        },
        paint: {
          'text-color': '#e8edf4',
          'text-halo-color': 'rgba(12, 18, 25, 0.92)',
          'text-halo-width': 1.2,
        },
      });
      map.on('click', 'nodes', (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current(id);
      });
      map.on('click', 'node-labels', (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current(id);
      });
      map.resize();
      setStyleError(false);
      setReady(true);
    };

    const useRaster = () => {
      if (dead || usedFallback || map.isStyleLoaded()) return;
      usedFallback = true;
      setReady(false);
      map.setStyle(RASTER_STYLE);
    };

    const failTimer = window.setTimeout(useRaster, 6000);
    map.on('style.load', () => {
      if (dead) return;
      window.clearTimeout(failTimer);
      mountLayers();
    });
    map.on('error', (event) => {
      const message = event.error?.message ?? '';
      if (dead || map.getSource('nodes')) return;
      if (!usedFallback && /style|ajax|fetch|sprite|glyph|Failed/i.test(message)) {
        useRaster();
        return;
      }
      if (usedFallback && !map.isStyleLoaded() && /style|ajax|fetch|Failed/i.test(message)) {
        setStyleError(true);
      }
    });
    const observer = new ResizeObserver(() => {
      if (!dead) map.resize();
    });
    observer.observe(container);
    requestAnimationFrame(() => {
      if (!dead) map.resize();
    });
    return () => {
      dead = true;
      window.clearTimeout(failTimer);
      observer.disconnect();
      userMarker.current?.remove();
      userMarker.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;
    const frame = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(frame);
  }, [active, fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const nodes = map.getSource('nodes') as GeoJSONSource | undefined;
    const mainSource = map.getSource('lines-main') as GeoJSONSource | undefined;
    const altSource = map.getSource('lines-alt') as GeoJSONSource | undefined;
    if (!nodes || !mainSource || !altSource) return;
    const main = model.lines.features.filter((feature) => feature.properties.alt !== 1);
    const alt = model.lines.features.filter((feature) => feature.properties.alt === 1);
    nodes.setData(model.points);
    mainSource.setData({ type: 'FeatureCollection', features: main });
    altSource.setData({ type: 'FeatureCollection', features: alt });
  }, [model, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !active) return;
    if (model.located.length === 0) return;
    const frame = requestAnimationFrame(() => {
      map.resize();
      const bounds = new maplibregl.LngLatBounds();
      for (const point of model.located) bounds.extend([point.lng, point.lat]);
      map.fitBounds(bounds, {
        padding: { top: 36, bottom: 56, left: 24, right: 76 },
        maxZoom: 13,
        duration: 400,
      });
    });
    return () => cancelAnimationFrame(frame);
    // boundsKey 只含坐标。点选节点不重新缩放，避免弹框打开时地图被拽走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, ready, active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('user-acc') as GeoJSONSource | undefined;
    if (!fix || !source) {
      source?.setData(emptyCollection());
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    source.setData(accuracyRing(fix.lng, fix.lat, Math.max(fix.accuracy, 12)));
    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = 'me-dot';
      el.title = '当前位置';
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([fix.lng, fix.lat]).addTo(map);
    } else {
      userMarker.current.setLngLat([fix.lng, fix.lat]);
    }
  }, [fix, ready]);

  useEffect(() => {
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  function fitTrip() {
    const map = mapRef.current;
    if (!map || model.located.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const point of model.located) bounds.extend([point.lng, point.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 500 });
  }

  function stopLocate() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setLocState('off');
    setFix(null);
    setLocNote('');
    flew.current = false;
  }

  function startLocate() {
    if (!secure || !navigator.geolocation) {
      setLocState('error');
      setLocNote('定位需要安全连接。用 https 打开这一页，或在电脑的 localhost 上试。');
      return;
    }
    setLocState('wait');
    setLocNote('正在向系统要位置…');
    flew.current = false;
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracy: position.coords.accuracy,
        };
        setFix(next);
        setLocState('on');
        setLocNote(
          `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)} · 大约 ±${Math.round(next.accuracy)} 米`,
        );
        const map = mapRef.current;
        if (map && !flew.current) {
          flew.current = true;
          map.flyTo({ center: [next.lng, next.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
        }
      },
      (error) => {
        if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        setFix(null);
        if (error.code === error.PERMISSION_DENIED) {
          setLocState('denied');
          setLocNote('定位被拒绝，地图仍可查看行程。可到 iPhone 设置 → 隐私与安全性 → 定位服务 → Safari 再允许。');
        } else if (error.code === error.TIMEOUT) {
          setLocState('error');
          setLocNote('定位超时，再到室外或窗边试一次。');
        } else {
          setLocState('error');
          setLocNote('没有拿到位置。');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
  }

  const selected = model.located.find((point) => point.id === selectedId);

  return (
    <div className="map-wrap">
      <div ref={host} className="map-host" />
      {selected ? (
        <p className="map-tag" aria-hidden>
          {selected.name}
        </p>
      ) : null}
      <div className={`map-tools${toolsOpen ? '' : ' is-shut'}`}>
        <button
          type="button"
          aria-expanded={toolsOpen}
          aria-label={toolsOpen ? '收起地图工具' : '展开地图工具'}
          title={toolsOpen ? '收起' : '展开'}
          onClick={() => setToolsOpen((open) => !open)}
        >
          <ToolIcon name={toolsOpen ? 'fold' : 'unfold'} />
        </button>
        {toolsOpen ? (
          <>
            <button
              type="button"
              className={locState === 'on' || locState === 'wait' ? 'is-on' : ''}
              data-testid="locate"
              aria-label={locState === 'on' || locState === 'wait' ? '停止定位' : '我的位置'}
              title={locState === 'on' || locState === 'wait' ? '停止定位' : '我的位置'}
              onClick={() => (locState === 'on' || locState === 'wait' ? stopLocate() : startLocate())}
            >
              <ToolIcon name="locate" />
            </button>
            <button type="button" aria-label="放大" title="放大" onClick={() => mapRef.current?.zoomIn()}>
              <ToolIcon name="in" />
            </button>
            <button type="button" aria-label="缩小" title="缩小" onClick={() => mapRef.current?.zoomOut()}>
              <ToolIcon name="out" />
            </button>
            <button type="button" aria-label="看行程" title="看行程" onClick={fitTrip}>
              <ToolIcon name="fit" />
            </button>
          </>
        ) : null}
      </div>
      {locNote ? <p className="map-pill">{locNote}</p> : null}
      {styleError ? (
        <p className="map-pill map-pill--warn">底图暂时没载入。行程点仍会标在图上，检查网络后再打开这一页。</p>
      ) : null}
      {model.located.length === 0 ? <p className="map-pill">这一范围里没有带坐标的站点。</p> : null}
    </div>
  );
}
