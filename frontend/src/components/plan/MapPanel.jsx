import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTravel } from '../../context/TravelContext';
import { Compass, MapPin, Utensils, Plane, Hotel, AlertTriangle } from 'lucide-react';
import { requireEnv } from '../../config/env';

// 中国大陆 + 港澳台经纬度范围（高德地图仅支持这些区域的详细底图）
const CHINA_BOUNDS = {
  latMin: 3.5,
  latMax: 53.5,
  lngMin: 73.5,
  lngMax: 135.5,
};

// 判断坐标是否在中国区域内
const isInChina = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true; // 默认中国
  return (
    lat >= CHINA_BOUNDS.latMin &&
    lat <= CHINA_BOUNDS.latMax &&
    lng >= CHINA_BOUNDS.lngMin &&
    lng <= CHINA_BOUNDS.lngMax
  );
};

// 简单的脚本加载工具，避免重复加载高德 SDK
const loadAmapScript = (() => {
  let loadingPromise = null;
  return () => {
    if (window.AMap) return Promise.resolve(window.AMap);
    if (loadingPromise) return loadingPromise;

    const key = requireEnv('AMAP_WEB_KEY', '缺少高德地图 Key：请配置 VITE_AMAP_WEB_KEY（用于国内地图）。');
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`;

    loadingPromise = new Promise((resolve, reject) => {
      script.onload = () => {
        if (window.AMap) {
          resolve(window.AMap);
        } else {
          reject(new Error('AMap 加载失败'));
        }
      };
      script.onerror = () => reject(new Error('AMap 脚本加载出错'));
    });

    document.body.appendChild(script);
    return loadingPromise;
  };
})();

// Mapbox 脚本加载（国外地图）
const loadMapboxScript = (() => {
  let loadingPromise = null;
  return () => {
    if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
    if (loadingPromise) return loadingPromise;

    const token = requireEnv('MAPBOX_TOKEN', '缺少 Mapbox Token：请配置 VITE_MAPBOX_TOKEN（用于国外地图）。');

    // 加载 CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
    document.head.appendChild(link);

    // 加载 JS
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';

    loadingPromise = new Promise((resolve, reject) => {
      script.onload = () => {
        if (window.mapboxgl) {
          window.mapboxgl.accessToken = token;
          resolve(window.mapboxgl);
        } else {
          reject(new Error('Mapbox 加载失败'));
        }
      };
      script.onerror = () => reject(new Error('Mapbox 脚本加载出错'));
    });

    document.body.appendChild(script);
    return loadingPromise;
  };
})();

const MapPanel = () => {
  const { mapCenter, mapZoom, mapPoints, itinerary } = useTravel();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const markersRef = useRef([]);
  const lastSignatureRef = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState(null); // 'amap' | 'mapbox'
  const [mapError, setMapError] = useState(null);

  // 如果有后端返回的 mapPoints，则优先使用；否则退回到基于 itinerary 的本地模拟数据
  const fallbackItineraryPoints = Object.values(itinerary || {}).flatMap((day) => {
    // 新结构：{ morning:[], afternoon:[], evening:[] }
    if (day && typeof day === 'object' && !Array.isArray(day)) {
      const m = Array.isArray(day.morning) ? day.morning : [];
      const a = Array.isArray(day.afternoon) ? day.afternoon : [];
      const e = Array.isArray(day.evening) ? day.evening : [];
      return [...m, ...a, ...e];
    }
    // 旧结构：数组
    if (Array.isArray(day)) return day;
    return [];
  });
  const allPoints = (mapPoints && mapPoints.length > 0) ? mapPoints : fallbackItineraryPoints;

  // 根据 mapCenter 判断使用哪个地图提供商
  const shouldUseMapbox = useMemo(() => {
    const [lat, lng] = mapCenter || [];
    return !isInChina(lat, lng);
  }, [mapCenter]);

  // 清理地图实例的通用函数
  const cleanupMap = () => {
    try {
      if (polylineRef.current && mapRef.current) {
        if (mapProvider === 'amap') {
          mapRef.current.remove(polylineRef.current);
        }
        polylineRef.current = null;
      }
    } catch (e) { /* ignore */ }

    try {
      if (markersRef.current.length && mapRef.current) {
        markersRef.current.forEach((m) => {
          try {
            if (mapProvider === 'amap') {
              mapRef.current.remove(m);
            } else if (m.remove) {
              m.remove();
            }
          } catch (e) { /* ignore */ }
        });
        markersRef.current = [];
      }
    } catch (e) { /* ignore */ }

    try {
      if (mapRef.current) {
        if (mapProvider === 'amap') {
          mapRef.current.destroy();
        } else if (mapRef.current.remove) {
          mapRef.current.remove();
        }
        mapRef.current = null;
      }
    } catch (e) { /* ignore */ }

    lastSignatureRef.current = '';
    setMapReady(false);
  };

  // 获取标记颜色
  const getMarkerColor = (category) => {
    if (category === '美食') return '#F56565';
    if (category === '机场') return '#22C55E';
    if (category === '住宿') return '#92400E';
    return '#2B6CB0'; // 景点默认蓝色
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      try {
        // 切换地图提供商时，先清理旧地图
        if (mapRef.current && ((shouldUseMapbox && mapProvider === 'amap') || (!shouldUseMapbox && mapProvider === 'mapbox'))) {
          cleanupMap();
        }

        const validPoints = (allPoints || []).filter(
          (poi) => Number.isFinite(poi.lng) && Number.isFinite(poi.lat)
        );

        if (shouldUseMapbox) {
          // 使用 Mapbox（国外地图）
          const mapboxgl = await loadMapboxScript();
          if (!isMounted) return;

          setMapProvider('mapbox');
          setMapError(null);

          const center = [mapCenter[1], mapCenter[0]]; // [lng, lat]

          if (!mapRef.current) {
            mapRef.current = new mapboxgl.Map({
              container: mapContainerRef.current,
              style: 'mapbox://styles/mapbox/dark-v11',
              center,
              zoom: mapZoom,
            });

            // 捕获 Mapbox 的网络/鉴权错误（例如 401 invalid token）
            mapRef.current.on('error', (e) => {
              const status = e?.error?.status || e?.error?.statusCode;
              if (status === 401) {
                setMapError('Mapbox 鉴权失败（401）：请检查 VITE_MAPBOX_TOKEN 是否有效、是否有 styles:read 等权限。');
              }
            });

            mapRef.current.on('load', () => {
              if (isMounted) setMapReady(true);
            });
          } else {
            mapRef.current.setCenter(center);
            mapRef.current.setZoom(mapZoom);
          }

          // 清理旧标记
          markersRef.current.forEach((m) => {
            try { m.remove(); } catch (e) { /* ignore */ }
          });
          markersRef.current = [];

          if (!validPoints.length) return;

          const signature = validPoints.map((p) => `${p.id || ''}:${p.lng},${p.lat}:${p.category || ''}`).join('|');
          if (lastSignatureRef.current === signature) return;
          lastSignatureRef.current = signature;

          // 添加标记
          validPoints.forEach((poi) => {
            const color = getMarkerColor(poi.category);
            const el = document.createElement('div');
            el.style.cssText = `
              width: 20px;
              height: 20px;
              border-radius: 999px;
              border: 2px solid #ffffff;
              background-color: ${color};
              box-shadow: 0 2px 8px rgba(15, 23, 42, 0.4);
              cursor: pointer;
            `;

            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div style="max-width: 220px; font-family: system-ui, sans-serif; padding: 4px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1e293b;">${poi.name}</h3>
                <p style="margin: 0; font-size: 12px; color: #64748b;">${poi.category} · 建议停留 ${poi.duration || 60} 分钟</p>
              </div>
            `);

            const marker = new mapboxgl.Marker(el)
              .setLngLat([poi.lng, poi.lat])
              .setPopup(popup)
              .addTo(mapRef.current);

            markersRef.current.push(marker);
          });

          // 添加路线
          if (validPoints.length > 1 && mapRef.current.isStyleLoaded()) {
            const coordinates = validPoints.map((p) => [p.lng, p.lat]);
            
            if (mapRef.current.getSource('route')) {
              mapRef.current.getSource('route').setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates },
              });
            } else {
              mapRef.current.addSource('route', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates },
                },
              });
              mapRef.current.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#38bdf8', 'line-width': 3 },
              });
            }
          }

        } else {
          // 使用高德地图（国内）
          const AMap = await loadAmapScript();
          if (!isMounted) return;

          setMapProvider('amap');
          setMapError(null);

          const center = [mapCenter[1], mapCenter[0]]; // 高德经纬度顺序为 [lng, lat]

          if (!mapRef.current) {
            mapRef.current = new AMap.Map(mapContainerRef.current, {
              center,
              zoom: mapZoom,
              viewMode: '2D',
              zooms: [3, 20],
            });
            setMapReady(true);
          } else {
            mapRef.current.setZoomAndCenter(mapZoom, center);
          }

          // 清理旧标记
          if (markersRef.current.length) {
            markersRef.current.forEach((marker) => {
              try { mapRef.current.remove(marker); } catch (e) { /* ignore */ }
            });
            markersRef.current = [];
          }

          // 清理旧折线
          if (polylineRef.current) {
            try { mapRef.current.remove(polylineRef.current); } catch (e) { /* ignore */ }
            polylineRef.current = null;
          }

          if (!validPoints.length) return;

          const signature = validPoints.map((p) => `${p.id || ''}:${p.lng},${p.lat}:${p.category || ''}`).join('|');
          if (lastSignatureRef.current === signature) return;
          lastSignatureRef.current = signature;

          const path = validPoints.map((poi) => [poi.lng, poi.lat]);

          polylineRef.current = new AMap.Polyline({
            path,
            strokeColor: '#38bdf8',
            strokeWeight: 3,
            strokeOpacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round',
            showDir: true,
          });

          mapRef.current.add(polylineRef.current);

          validPoints.forEach((poi) => {
            const color = getMarkerColor(poi.category);
            const marker = new AMap.Marker({
              position: [poi.lng, poi.lat],
              title: poi.name,
              offset: new AMap.Pixel(-8, -8),
              content: `
                <div style="
                  width: 16px;
                  height: 16px;
                  border-radius: 999px;
                  border: 2px solid #ffffff;
                  background-color: ${color};
                  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
                "></div>
              `,
            });

            const info = new AMap.InfoWindow({
              offset: new AMap.Pixel(0, -24),
              content: `
                <div style="max-width: 220px; font-family: system-ui, sans-serif;">
                  <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1e293b;">${poi.name}</h3>
                  <p style="margin: 0; font-size: 12px; color: #64748b;">${poi.category} · 建议停留 ${poi.duration || 60} 分钟</p>
                </div>
              `,
            });

            marker.on('click', () => {
              info.open(mapRef.current, marker.getPosition());
            });

            mapRef.current.add(marker);
            markersRef.current.push(marker);
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('加载地图失败:', error);
        if (isMounted) {
          setMapError(error.message || '地图加载失败');
        }
      }
    };

    initMap();

    return () => {
      isMounted = false;
      cleanupMap();
    };
  }, [mapCenter, mapZoom, allPoints.length, shouldUseMapbox]);

  return (
    <div className="h-full w-full relative z-0 bg-slate-950">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Map Legend */}
      {allPoints.length > 0 && (
        <div className="absolute top-4 right-4 bg-slate-900/75 backdrop-blur-xl p-3 rounded-xl shadow-2xl border border-slate-800/70 text-xs space-y-2 text-slate-100 z-[1000]">
          <div className="font-semibold mb-1 flex items-center gap-2 text-slate-100">
            <Compass size={14} className="text-sky-300" />
            图例
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2B6CB0] border border-white shadow-sm" />
            <span className="flex items-center gap-1">
              <MapPin size={12} className="text-slate-300" /> 景点
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#F56565] border border-white shadow-sm" />
            <span className="flex items-center gap-1">
              <Utensils size={12} className="text-slate-300" /> 美食
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22C55E] border border-white shadow-sm" />
            <span className="flex items-center gap-1">
              <Plane size={12} className="text-slate-300" /> 机场
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#92400E] border border-white shadow-sm" />
            <span className="flex items-center gap-1">
              <Hotel size={12} className="text-slate-300" /> 住宿
            </span>
          </div>
        </div>
      )}

      {/* Map Loading */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-slate-700/80 border-t-sky-400 rounded-full animate-spin" />
            <div className="text-xs text-slate-300">
              {shouldUseMapbox ? '🌍 加载国际地图…' : '🗺️ 加载地图中…'}
            </div>
          </div>
        </div>
      )}

      {/* Map Error */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <AlertTriangle size={32} className="text-amber-400" />
            <div className="text-sm text-slate-200 font-medium">地图加载失败</div>
            <div className="text-xs text-slate-400 max-w-xs">{mapError}</div>
          </div>
        </div>
      )}

      {/* Provider indicator */}
      {mapReady && mapProvider && (
        <div className="absolute bottom-4 left-4 bg-slate-900/70 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-400 border border-slate-800/50">
          {mapProvider === 'mapbox' ? '🌍 Mapbox' : '🇨🇳 高德地图'}
        </div>
      )}
    </div>
  );
};

export default MapPanel;
