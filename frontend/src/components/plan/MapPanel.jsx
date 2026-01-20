import React, { useEffect, useRef, useState } from 'react';
import { useTravel } from '../../context/TravelContext';
import { Compass, MapPin, Utensils, Plane, Hotel } from 'lucide-react';

// 简单的脚本加载工具，避免重复加载高德 SDK
const loadAmapScript = (() => {
  let loadingPromise = null;
  return () => {
    if (window.AMap) return Promise.resolve(window.AMap);
    if (loadingPromise) return loadingPromise;

    const key = import.meta.env.VITE_AMAP_WEB_KEY || '31d12ccab5b38ae944d01977a0d37cc1';
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

const MapPanel = () => {
  const { mapCenter, mapZoom, mapPoints, itinerary } = useTravel();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const markersRef = useRef([]);
  const lastSignatureRef = useRef('');
  const [mapReady, setMapReady] = useState(false);

  // 如果有后端返回的 mapPoints，则优先使用；否则退回到基于 itinerary 的本地模拟数据
  const fallbackItineraryPoints = Object.values(itinerary || {}).flat();
  const allPoints = (mapPoints && mapPoints.length > 0) ? mapPoints : fallbackItineraryPoints;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;

    loadAmapScript()
      .then((AMap) => {
        if (!isMounted || !AMap) return;

        const center = [mapCenter[1], mapCenter[0]]; // 高德经纬度顺序为 [lng, lat]

        if (!mapRef.current) {
          mapRef.current = new AMap.Map(mapContainerRef.current, {
            center,
            zoom: mapZoom,
            // 2D 模式通常更轻量，可减少 canvas 相关 readback 压力提示
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
            try {
              mapRef.current.remove(marker);
            } catch (e) {
              // ignore
            }
          });
          markersRef.current = [];
        }

        // 清理旧折线
        if (polylineRef.current) {
          try {
            mapRef.current.remove(polylineRef.current);
          } catch (e) {
            // ignore
          }
          polylineRef.current = null;
        }

        const validPoints = (allPoints || []).filter(
          (poi) => Number.isFinite(poi.lng) && Number.isFinite(poi.lat)
        );
        if (!validPoints.length) return;

        // 点集合没变就不重复清理/重绘（降低 canvas 压力）
        const signature = validPoints.map((p) => `${p.id || ''}:${p.lng},${p.lat}:${p.category || ''}`).join('|');
        if (lastSignatureRef.current === signature) return;
        lastSignatureRef.current = signature;

        const path = validPoints.map((poi) => [poi.lng, poi.lat]);

        polylineRef.current = new AMap.Polyline({
          path,
          strokeColor: '#2B6CB0',
          strokeWeight: 3,
          strokeOpacity: 0.8,
          lineJoin: 'round',
          lineCap: 'round',
          showDir: true,
        });

        mapRef.current.add(polylineRef.current);

        validPoints.forEach((poi) => {
          let color = '#2B6CB0'; // 景点：蓝色
          if (poi.category === '美食') {
            color = '#F56565'; // 餐厅：红色
          } else if (poi.category === '机场') {
            color = '#22C55E'; // 机场：绿色
          } else if (poi.category === '住宿') {
            color = '#92400E'; // 住宿：棕色
          }
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
              <div style="max-width: 220px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;">
                <div style="width: 100%; height: 96px; margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: #e2e8f0;">
                  <img 
                    src="https://www.weavefox.cn/api/bolt/unsplash_image?keyword=${encodeURIComponent(
                      poi.imageKeyword || poi.name,
                    )}&width=220&height=150&random=${poi.id}"
                    alt="${poi.name}"
                    style="width: 100%; height: 100%; object-fit: cover;"
                  />
                </div>
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1e293b;">${poi.name}</h3>
                <p style="margin: 0; font-size: 12px; color: #64748b;">${poi.category} · 建议停留 ${
                  poi.duration
                } 分钟</p>
                <div style="margin-top: 4px; font-size: 12px; font-weight: 500; color: #f59e0b;">
                  ★ ${poi.rating}
                </div>
              </div>
            `,
          });

          marker.on('click', () => {
            info.open(mapRef.current, marker.getPosition());
          });

          mapRef.current.add(marker);
          markersRef.current.push(marker);
        });
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('加载高德地图失败:', error);
      });

    return () => {
      isMounted = false;
      // 关键：销毁地图实例，避免 React 卸载时 DOM 已被第三方改动导致 removeChild 报错
      try {
        if (polylineRef.current && mapRef.current) {
          mapRef.current.remove(polylineRef.current);
          polylineRef.current = null;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (markersRef.current.length && mapRef.current) {
          markersRef.current.forEach((m) => {
            try { mapRef.current.remove(m); } catch (e) { /* ignore */ }
          });
          markersRef.current = [];
        }
      } catch (e) {
        // ignore
      }
      try {
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
      } catch (e) {
        // ignore
      }
      lastSignatureRef.current = '';
      setMapReady(false);
    };
  }, [mapCenter, mapZoom, allPoints.length]);

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

      {/* Map Loading（更透明 + 深色主题） */}
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-slate-700/80 border-t-sky-400 rounded-full animate-spin" />
            <div className="text-xs text-slate-300">地图加载中…</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPanel;
