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

// Mapbox 脚本加载（国外地图）- 添加超时和错误处理
const loadMapboxScript = (() => {
  let loadingPromise = null;
  return () => {
    if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
    if (loadingPromise) return loadingPromise;

    const token = requireEnv('MAPBOX_TOKEN', '缺少 Mapbox Token：请配置 VITE_MAPBOX_TOKEN（用于国外地图）。');

    // 检查 CSS 是否已加载
    const existingLink = document.querySelector('link[href*="mapbox-gl.css"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
      document.head.appendChild(link);
    }

    // 加载 JS
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';

    loadingPromise = new Promise((resolve, reject) => {
      // 添加超时处理（10秒）
      const timeout = setTimeout(() => {
        script.onload = null;
        script.onerror = null;
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        reject(new Error('Mapbox 脚本加载超时（>10秒），请检查网络连接或使用代理'));
      }, 10000);

      script.onload = () => {
        clearTimeout(timeout);
        // 等待一小段时间确保 mapboxgl 全局对象已初始化
        setTimeout(() => {
          if (window.mapboxgl) {
            window.mapboxgl.accessToken = token;
            resolve(window.mapboxgl);
          } else {
            reject(new Error('Mapbox 加载失败：全局对象未初始化'));
          }
        }, 100);
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Mapbox 脚本加载出错：网络请求失败'));
      };
    });

    document.body.appendChild(script);
    return loadingPromise;
  };
})();

const MapPanel = () => {
  const { mapCenter, mapZoom, mapPoints, itinerary } = useTravel();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null); // 高德地图：存储所有折线
  const polylinesRef = useRef([]); // 高德地图：按天存储多条折线
  const amapOverlaysByDayRef = useRef({}); // 高德地图：按天归档 overlays，便于 show/hide
  const mapboxRoutesByDayRef = useRef({}); // Mapbox：按天归档路线数据，便于流式渲染
  const markersRef = useRef([]);
  const lastSignatureRef = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapProvider, setMapProvider] = useState(null); // 'amap' | 'mapbox'
  const [mapError, setMapError] = useState(null);
  const loadTimeoutRef = useRef(null);
  const [selectedDay, setSelectedDay] = useState(null); // null 表示显示所有天
  const [completedDays, setCompletedDays] = useState(new Set()); // 记录已完成渲染的天数
  
  // 监听流式渲染完成事件
  useEffect(() => {
    const handleDayCompleted = (event) => {
      const { dayNumber } = event.detail;
      setCompletedDays((prev) => {
        const next = new Set(prev);
        next.add(dayNumber);
        return next;
      });
    };
    
    window.addEventListener('dayCompleted', handleDayCompleted);
    return () => {
      window.removeEventListener('dayCompleted', handleDayCompleted);
    };
  }, []);
  
  // 每天路线颜色（渐变色系，确保区分度）
  const dayColors = [
    '#38bdf8', // 第1天：天蓝色
    '#10b981', // 第2天：绿色
    '#f59e0b', // 第3天：橙色
    '#ef4444', // 第4天：红色
    '#8b5cf6', // 第5天：紫色
    '#ec4899', // 第6天：粉色
    '#06b6d4', // 第7天：青色
    '#84cc16', // 第8天：黄绿色
  ];

  // 从 itinerary 中提取每天的路线点（按天分组），包含起始点和终止点
  // 流式渲染：只渲染已完成的天数（completedDays）
  const dailyRoutes = useMemo(() => {
    const routes = [];
    const dayKeys = Object.keys(itinerary || {}).filter(key => key.startsWith('day')).sort();
    
    dayKeys.forEach((dayKey, dayIndex) => {
      const dayNum = dayIndex + 1;
      const day = itinerary[dayKey];
      if (!day) return;
      
      // 流式渲染：只处理已完成的天数（如果 completedDays 不为空）
      // 判断标准：该天有 start_point 或 end_point，且至少有一个时间段有数据
      const hasStartOrEnd = day.start_point || day.end_point;
      const hasItems = (Array.isArray(day.morning) && day.morning.length > 0) ||
                       (Array.isArray(day.afternoon) && day.afternoon.length > 0) ||
                       (Array.isArray(day.evening) && day.evening.length > 0);
      const isDayComplete = hasStartOrEnd && hasItems;
      
      // 如果 completedDays 不为空，只渲染已完成的天
      if (completedDays.size > 0 && !completedDays.has(dayNum) && !isDayComplete) {
        return; // 该天的数据还未完成，跳过渲染
      }
      
      // 新结构：{ morning:[], afternoon:[], evening:[] }
      let dayPoints = [];
      if (day && typeof day === 'object' && !Array.isArray(day)) {
        const m = Array.isArray(day.morning) ? day.morning : [];
        const a = Array.isArray(day.afternoon) ? day.afternoon : [];
        const e = Array.isArray(day.evening) ? day.evening : [];
        dayPoints = [...m, ...a, ...e];
      } else if (Array.isArray(day)) {
        dayPoints = day;
      }
      
      // 过滤出有经纬度的点，并按时间顺序排序
      const validPoints = dayPoints
        .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
        .map((poi) => ({
          ...poi,
          lat: Number(poi.lat),
          lng: Number(poi.lng),
        }));
      
      // 获取起始点和终止点
      const startPoint = day.start_point && Number.isFinite(day.start_point.lat) && Number.isFinite(day.start_point.lng)
        ? { ...day.start_point, lat: Number(day.start_point.lat), lng: Number(day.start_point.lng) }
        : null;
      const endPoint = day.end_point && Number.isFinite(day.end_point.lat) && Number.isFinite(day.end_point.lng)
        ? { ...day.end_point, lat: Number(day.end_point.lat), lng: Number(day.end_point.lng) }
        : null;
      
      // 构建完整的路线点序列：起始点 -> 景点/餐厅 -> 终止点
      const routePoints = [];
      if (startPoint) {
        routePoints.push(startPoint);
      }
      routePoints.push(...validPoints);
      if (endPoint && (!startPoint || (endPoint.lat !== startPoint.lat || endPoint.lng !== startPoint.lng))) {
        routePoints.push(endPoint);
      }
      
      if (routePoints.length > 0) {
        routes.push({
          dayNumber: dayIndex + 1,
          dayKey,
          points: routePoints,
          startPoint,
          endPoint,
          color: dayColors[dayIndex % dayColors.length],
        });
      }
    });
    
    return routes;
  }, [itinerary, completedDays]);
  
  // 所有点（用于标记显示），包括起始点和终止点
  const allPoints = useMemo(() => {
    const points = [];
    
    // 添加 mapPoints（后端返回的推荐点）
    if (mapPoints && mapPoints.length > 0) {
      points.push(...mapPoints);
    }
    
    // 从 dailyRoutes 中提取所有点，包括起始点和终止点
    dailyRoutes.forEach(route => {
      // 添加起始点
      if (route.startPoint && route.startPoint.lat != null && route.startPoint.lng != null) {
        points.push({
          id: `start_${route.dayNumber}`,
          name: route.startPoint.name || '起始点',
          lat: route.startPoint.lat,
          lng: route.startPoint.lng,
          category: route.startPoint.category || '起点',
          type: route.startPoint.type,
        });
      }
      // 添加终止点（如果与起始点不同）
      if (route.endPoint && route.endPoint.lat != null && route.endPoint.lng != null) {
        const isSameAsStart = route.startPoint && 
          route.startPoint.lat === route.endPoint.lat && 
          route.startPoint.lng === route.endPoint.lng;
        if (!isSameAsStart) {
          points.push({
            id: `end_${route.dayNumber}`,
            name: route.endPoint.name || '终止点',
            lat: route.endPoint.lat,
            lng: route.endPoint.lng,
            category: route.endPoint.category || '终点',
            type: route.endPoint.type,
          });
        }
      }
      // 添加路线中的其他点
      route.points.forEach((point, idx) => {
        // 跳过起始点和终止点（避免重复）
        if (point.lat != null && point.lng != null) {
          const isStart = route.startPoint && 
            point.lat === route.startPoint.lat && 
            point.lng === route.startPoint.lng;
          const isEnd = route.endPoint && 
            point.lat === route.endPoint.lat && 
            point.lng === route.endPoint.lng;
          if (!isStart && !isEnd) {
            points.push({
              id: `route_${route.dayNumber}_${idx}`,
              name: point.name || '地点',
              lat: point.lat,
              lng: point.lng,
              category: point.category || '景点',
            });
          }
        }
      });
    });
    
    // 去重：基于经纬度
    const seen = new Set();
    return points.filter(point => {
      const key = `${point.lat}_${point.lng}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [mapPoints, dailyRoutes]);

  // 根据 mapCenter 判断使用哪个地图提供商
  const shouldUseMapbox = useMemo(() => {
    const [lat, lng] = mapCenter || [];
    return !isInChina(lat, lng);
  }, [mapCenter]);

  // 清理地图实例的通用函数
  const cleanupMap = () => {
    try {
      // 清理高德地图的所有折线
      if (polylinesRef.current.length && mapRef.current && mapProvider === 'amap') {
        polylinesRef.current.forEach((polyline) => {
          try {
            if (polyline) mapRef.current.remove(polyline);
          } catch (e) { /* ignore */ }
        });
        polylinesRef.current = [];
      }
      // 清理高德地图按天归档的 overlays
      if (mapRef.current && mapProvider === 'amap' && amapOverlaysByDayRef.current) {
        Object.values(amapOverlaysByDayRef.current).forEach((arr) => {
          (arr || []).forEach((ov) => {
            try {
              if (ov) mapRef.current.remove(ov);
            } catch (e) { /* ignore */ }
          });
        });
        amapOverlaysByDayRef.current = {};
      }
      // 兼容旧代码
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

        // 不再使用 allPoints 过滤，改用 dailyRoutes

        if (shouldUseMapbox) {
          // 使用 Mapbox（国外地图）
          const mapboxgl = await loadMapboxScript();
          if (!isMounted) return;

          setMapProvider('mapbox');
          setMapError(null);

          const center = [mapCenter[1], mapCenter[0]]; // [lng, lat]

          if (!mapRef.current) {
            // 清除之前的超时
            if (loadTimeoutRef.current) {
              clearTimeout(loadTimeoutRef.current);
            }

            mapRef.current = new mapboxgl.Map({
              container: mapContainerRef.current,
              style: 'mapbox://styles/mapbox/dark-v11',
              center,
              zoom: mapZoom,
              // 优化性能选项
              antialias: false,
              preserveDrawingBuffer: false,
            });

            // 设置地图加载超时（15秒）
            loadTimeoutRef.current = setTimeout(() => {
              if (isMounted && !mapReady) {
                setMapError('地图样式加载超时（>15秒），可能是网络问题或 Token 无效。请检查网络连接或 VITE_MAPBOX_TOKEN 配置。');
              }
            }, 15000);

            // 捕获 Mapbox 的各种错误
            mapRef.current.on('error', (e) => {
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
              }
              
              const error = e?.error || {};
              const status = error.status || error.statusCode;
              const message = error.message || '';

              if (status === 401) {
                setMapError('Mapbox 鉴权失败（401）：请检查 VITE_MAPBOX_TOKEN 是否有效、是否有 styles:read 等权限。');
              } else if (status === 403) {
                setMapError('Mapbox 访问被拒绝（403）：Token 可能没有足够权限或已过期。');
              } else if (status === 404) {
                setMapError('Mapbox 资源未找到（404）：地图样式加载失败。');
              } else if (message.includes('network') || message.includes('Network')) {
                setMapError('网络错误：无法连接到 Mapbox 服务器，请检查网络连接。');
              } else {
                setMapError(`地图加载错误：${message || '未知错误'} (状态码: ${status || 'N/A'})`);
              }
              
              if (isMounted) {
                setMapReady(false);
              }
            });

            // 地图加载成功
            mapRef.current.on('load', () => {
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
              }
              if (isMounted) {
                setMapReady(true);
                setMapError(null);
              }
            });

            // 监听样式数据加载完成（更早的加载完成信号）
            // 使用 data 事件可以更早检测到样式加载完成
            mapRef.current.on('data', (e) => {
              if (e.dataType === 'style' && mapRef.current.isStyleLoaded()) {
                if (loadTimeoutRef.current) {
                  clearTimeout(loadTimeoutRef.current);
                  loadTimeoutRef.current = null;
                }
                if (isMounted && !mapReady) {
                  setMapReady(true);
                  setMapError(null);
                }
              }
            });
          } else {
            mapRef.current.setCenter(center);
            mapRef.current.setZoom(mapZoom);
            // 如果地图已存在，直接设置为 ready
            if (mapRef.current.isStyleLoaded()) {
              setMapReady(true);
            }
          }

          // 等待地图样式加载完成
          const addRoutesAndMarkers = () => {
            if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
              return;
            }

            // 清理旧标记和路线
            markersRef.current.forEach((m) => {
              try { m.remove(); } catch (e) { /* ignore */ }
            });
            markersRef.current = [];

            // 清理旧路线图层（包括标签图层和箭头图层）
            dailyRoutes.forEach((route) => {
              const sourceId = `route_day${route.dayNumber}`;
              const layerId = `route_day${route.dayNumber}`;
              const labelLayerId = `${layerId}_label`;
              const arrowLayerId = `${layerId}_arrows`;
              const arrowSourceId = `${sourceId}_arrows`;
              try {
                if (mapRef.current.getLayer(arrowLayerId)) {
                  mapRef.current.removeLayer(arrowLayerId);
                }
                if (mapRef.current.getSource(arrowSourceId)) {
                  mapRef.current.removeSource(arrowSourceId);
                }
                if (mapRef.current.getLayer(labelLayerId)) {
                  mapRef.current.removeLayer(labelLayerId);
                }
                if (mapRef.current.getLayer(layerId)) {
                  mapRef.current.removeLayer(layerId);
                }
                if (mapRef.current.getSource(sourceId)) {
                  mapRef.current.removeSource(sourceId);
                }
              } catch (e) { /* ignore */ }
            });

            if (allPoints.length === 0) return;

            // 添加所有标记（使用图例颜色）
            allPoints.forEach((poi) => {
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

            // 为每天添加不同颜色的路线（流式渲染：只渲染已完成的天）
            dailyRoutes.forEach((route) => {
              if (route.points.length < 2) return;
              
              // 流式渲染：如果该天还未完成，跳过
              if (completedDays.size > 0 && !completedDays.has(route.dayNumber)) {
                return;
              }

              const sourceId = `route_day${route.dayNumber}`;
              const layerId = `route_day${route.dayNumber}`;
              const coordinates = route.points.map((p) => [p.lng, p.lat]);

              if (mapRef.current.getSource(sourceId)) {
                mapRef.current.getSource(sourceId).setData({
                  type: 'Feature',
                  properties: { day: route.dayNumber },
                  geometry: { type: 'LineString', coordinates },
                });
                
                // 更新箭头数据
                const arrowSourceId = `${sourceId}_arrows`;
                if (mapRef.current.getSource(arrowSourceId)) {
                  const arrowCoordinates = [];
                  const step = Math.max(1, Math.floor(coordinates.length / 6));
                  for (let i = step; i < coordinates.length - step; i += step) {
                    arrowCoordinates.push({
                      coord: coordinates[i],
                      index: i,
                    });
                  }
                  
                  if (arrowCoordinates.length > 0) {
                    const arrowFeatures = arrowCoordinates.map((item, idx) => {
                      const coord = item.coord;
                      let rotation = 0;
                      const nextIndex = item.index + 1;
                      if (nextIndex < coordinates.length) {
                        const nextCoord = coordinates[nextIndex];
                        const dx = nextCoord[0] - coord[0];
                        const dy = nextCoord[1] - coord[1];
                        rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
                      }
                      
                      return {
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: coord,
                        },
                        properties: {
                          rotation: rotation,
                        },
                      };
                    });
                    
                    mapRef.current.getSource(arrowSourceId).setData({
                      type: 'FeatureCollection',
                      features: arrowFeatures,
                    });
                  }
                }
              } else {
                mapRef.current.addSource(sourceId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    properties: { day: route.dayNumber },
                    geometry: { type: 'LineString', coordinates },
                  },
                });
                mapRef.current.addLayer({
                  id: layerId,
                  type: 'line',
                  source: sourceId,
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': route.color,
                    'line-width': 3,
                    'line-opacity': 0.8,
                  },
                });

                // 添加路线标签（显示天数）
                mapRef.current.addLayer({
                  id: `${layerId}_label`,
                  type: 'symbol',
                  source: sourceId,
                  layout: {
                    'symbol-placement': 'line',
                    'text-field': `第${route.dayNumber}天`,
                    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-offset': [0, 1.5],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                  },
                  paint: {
                    'text-color': route.color,
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2,
                  },
                });

                // 添加方向箭头（使用符号图层显示箭头字符）
                // 在路线上每隔一定距离添加一个箭头标记
                const arrowCoordinates = [];
                const step = Math.max(1, Math.floor(coordinates.length / 6)); // 在路线上添加约6个箭头
                for (let i = step; i < coordinates.length - step; i += step) {
                  arrowCoordinates.push({
                    coord: coordinates[i],
                    index: i,
                  });
                }
                
                if (arrowCoordinates.length > 0) {
                  const arrowSourceId = `${sourceId}_arrows`;
                  const arrowLayerId = `${layerId}_arrows`;
                  
                  // 计算每个箭头点的旋转角度（指向下一个点）
                  const arrowFeatures = arrowCoordinates.map((item, idx) => {
                    const coord = item.coord;
                    let rotation = 0;
                    const nextIndex = item.index + 1;
                    if (nextIndex < coordinates.length) {
                      const nextCoord = coordinates[nextIndex];
                      const dx = nextCoord[0] - coord[0];
                      const dy = nextCoord[1] - coord[1];
                      rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
                    }
                    
                    return {
                      type: 'Feature',
                      geometry: {
                        type: 'Point',
                        coordinates: coord,
                      },
                      properties: {
                        rotation: rotation,
                      },
                    };
                  });
                  
                  mapRef.current.addSource(arrowSourceId, {
                    type: 'geojson',
                    data: {
                      type: 'FeatureCollection',
                      features: arrowFeatures,
                    },
                  });
                  
                  // 使用 Unicode 箭头字符显示方向
                  mapRef.current.addLayer({
                    id: arrowLayerId,
                    type: 'symbol',
                    source: arrowSourceId,
                    layout: {
                      'symbol-placement': 'point',
                      'text-field': '▶',
                      'text-size': 10,
                      'text-rotate': ['get', 'rotation'],
                      'text-rotation-alignment': 'map',
                      'text-allow-overlap': true,
                      'text-ignore-placement': true,
                    },
                    paint: {
                      'text-color': route.color,
                      'text-halo-color': '#ffffff',
                      'text-halo-width': 1.5,
                    },
                  });
                }
              }
            });
          };

          // 如果地图已加载，立即添加；否则等待加载完成
          if (mapRef.current.isStyleLoaded()) {
            addRoutesAndMarkers();
          } else {
            mapRef.current.once('load', addRoutesAndMarkers);
            mapRef.current.once('data', (e) => {
              if (e.dataType === 'style') {
                addRoutesAndMarkers();
              }
            });
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
          polylinesRef.current.forEach((polyline) => {
            try {
              if (polyline) mapRef.current.remove(polyline);
            } catch (e) { /* ignore */ }
          });
          polylinesRef.current = [];
          // 清理按天归档 overlays
          try {
            Object.values(amapOverlaysByDayRef.current || {}).forEach((arr) => {
              (arr || []).forEach((ov) => {
                try { mapRef.current.remove(ov); } catch (e) { /* ignore */ }
              });
            });
          } catch (e) { /* ignore */ }
          amapOverlaysByDayRef.current = {};
          if (polylineRef.current) {
            try { mapRef.current.remove(polylineRef.current); } catch (e) { /* ignore */ }
            polylineRef.current = null;
          }

          if (allPoints.length === 0) return;

          // 添加所有标记（使用图例颜色）
          allPoints.forEach((poi) => {
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

          // 为每天添加不同颜色的路线（流式渲染：只渲染已完成的天）
          dailyRoutes.forEach((route) => {
            if (route.points.length < 2) return;
            
            // 流式渲染：如果该天还未完成，跳过
            if (completedDays.size > 0 && !completedDays.has(route.dayNumber)) {
              return;
            }

            // 检查是否已经渲染过该天的路线（避免重复添加）
            if (amapOverlaysByDayRef.current[route.dayNumber] && 
                amapOverlaysByDayRef.current[route.dayNumber].length > 0) {
              return; // 该天已渲染，跳过
            }

            const path = route.points.map((poi) => [poi.lng, poi.lat]);
            const polyline = new AMap.Polyline({
              path,
              strokeColor: route.color,
              strokeWeight: 3,
              strokeOpacity: 0.8,
              lineJoin: 'round',
              lineCap: 'round',
              showDir: true,
            });

            mapRef.current.add(polyline);
            polylinesRef.current.push(polyline);
            if (!amapOverlaysByDayRef.current[route.dayNumber]) {
              amapOverlaysByDayRef.current[route.dayNumber] = [];
            }
            amapOverlaysByDayRef.current[route.dayNumber].push(polyline);

            // 添加路线标签（显示天数）- 高德地图使用自定义 HTML 标记
            if (route.points.length > 0) {
              const midIndex = Math.floor(route.points.length / 2);
              const midPoint = route.points[midIndex];
              const labelEl = document.createElement('div');
              labelEl.style.cssText = `
                background-color: ${route.color};
                color: #ffffff;
                font-size: 11px;
                font-weight: 600;
                padding: 3px 8px;
                border-radius: 4px;
                border: 2px solid #ffffff;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                white-space: nowrap;
                pointer-events: none;
              `;
              labelEl.textContent = `第${route.dayNumber}天`;
              
              const labelMarker = new AMap.Marker({
                position: [midPoint.lng, midPoint.lat],
                content: labelEl,
                offset: new AMap.Pixel(-20, -10),
                zIndex: 100,
              });
              
              mapRef.current.add(labelMarker);
              polylinesRef.current.push(labelMarker);
              amapOverlaysByDayRef.current[route.dayNumber].push(labelMarker);
            }
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
      // 清除加载超时
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      cleanupMap();
    };
  }, [mapCenter, mapZoom, dailyRoutes, allPoints.length, shouldUseMapbox, completedDays]);

  // 选天：不重建地图，仅隐藏/显示对应路线图层
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapProvider) return;

    const dayKeys = Object.keys(itinerary || {}).filter(key => key.startsWith('day')).sort();
    const dayNumbers = dayKeys.map((_, idx) => idx + 1);

    if (mapProvider === 'mapbox') {
      dayNumbers.forEach((dayNum) => {
        const visible = selectedDay == null || selectedDay === dayNum;
        const layerId = `route_day${dayNum}`;
        const labelLayerId = `${layerId}_label`;
        const arrowLayerId = `${layerId}_arrows`;
        try {
          if (mapRef.current.getLayer(layerId)) {
            mapRef.current.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
          }
          if (mapRef.current.getLayer(labelLayerId)) {
            mapRef.current.setLayoutProperty(labelLayerId, 'visibility', visible ? 'visible' : 'none');
          }
          if (mapRef.current.getLayer(arrowLayerId)) {
            mapRef.current.setLayoutProperty(arrowLayerId, 'visibility', visible ? 'visible' : 'none');
          }
        } catch (e) { /* ignore */ }
      });
    }

    if (mapProvider === 'amap') {
      // AMap: 通过按天归档的 overlays 做 show/hide，不重建地图
      dayNumbers.forEach((dayNum) => {
        const visible = selectedDay == null || selectedDay === dayNum;
        const overlays = amapOverlaysByDayRef.current?.[dayNum] || [];
        overlays.forEach((ov) => {
          try {
            if (visible) {
              if (typeof ov.show === 'function') ov.show();
              else if (typeof ov.setOptions === 'function') ov.setOptions({ visible: true });
            } else {
              if (typeof ov.hide === 'function') ov.hide();
              else if (typeof ov.setOptions === 'function') ov.setOptions({ visible: false });
            }
          } catch (e) { /* ignore */ }
        });
      });
    }
  }, [selectedDay, mapReady, mapProvider, itinerary]);

  // 获取所有天数
  const allDays = useMemo(() => {
    const dayKeys = Object.keys(itinerary || {}).filter(key => key.startsWith('day')).sort();
    return dayKeys.map((_, index) => index + 1);
  }, [itinerary]);

  return (
    <div className="h-full w-full relative z-0 bg-slate-950">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Day Filter - 按天筛选按钮 */}
      {allDays.length > 0 && (
        <div className="absolute top-4 left-4 bg-slate-900/75 backdrop-blur-xl p-2 rounded-xl shadow-2xl border border-slate-800/70 z-[1000]">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedDay === null
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800/70 border border-slate-700/50'
              }`}
            >
              全部
            </button>
            {allDays.map((dayNum) => (
              <button
                key={dayNum}
                type="button"
                onClick={() => setSelectedDay(dayNum)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedDay === dayNum
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800/70 border border-slate-700/50'
                }`}
              >
                第{dayNum}天
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map Legend */}
      {allPoints.length > 0 && (
        <div className="absolute top-4 right-4 bg-slate-900/75 backdrop-blur-xl p-3 rounded-xl shadow-2xl border border-slate-800/70 text-xs space-y-2 text-slate-100 z-[1000]">
          <div className="font-semibold mb-1 flex items-center gap-2 text-slate-100">
            <Compass size={14} className="text-sky-300" />
            图例
          </div>
          
          {/* 节点类型 */}
          <div className="space-y-1.5 pb-2 border-b border-slate-700/50">
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
          
          {/* 路线颜色（按天） */}
          {dailyRoutes.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] text-slate-400 mb-1">路线（按天）</div>
              {dailyRoutes
                .filter((route) => selectedDay === null || route.dayNumber === selectedDay)
                .map((route) => (
                  <div key={route.dayKey} className="flex items-center gap-2">
                    <div
                      className="w-4 h-0.5 rounded"
                      style={{ backgroundColor: route.color }}
                    />
                    <span className="text-slate-300">第{route.dayNumber}天</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Map Loading */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-slate-700/80 border-t-sky-400 rounded-full animate-spin" />
            <div className="text-xs text-slate-300 text-center">
              {shouldUseMapbox ? (
                <>
                  <div>🌍 加载国际地图…</div>
                  <div className="text-[10px] text-slate-500 mt-1">首次加载可能需要 10-15 秒</div>
                </>
              ) : (
                '🗺️ 加载地图中…'
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map Error */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[2000]">
          <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
            <AlertTriangle size={40} className="text-amber-400" />
            <div className="text-base text-slate-200 font-semibold">地图加载失败</div>
            <div className="text-xs text-slate-400 leading-relaxed">{mapError}</div>
            <button
              type="button"
              onClick={() => {
                setMapError(null);
                setMapReady(false);
                // 触发重新加载：清理地图实例
                if (mapRef.current) {
                  try {
                    if (mapProvider === 'mapbox' && mapRef.current.remove) {
                      mapRef.current.remove();
                    } else if (mapProvider === 'amap' && mapRef.current.destroy) {
                      mapRef.current.destroy();
                    }
                  } catch (e) {
                    // ignore
                  }
                  mapRef.current = null;
                }
                // 清理标记和路线
                markersRef.current = [];
                polylineRef.current = null;
                lastSignatureRef.current = '';
                // 强制重新渲染
                setMapProvider(null);
              }}
              className="mt-2 px-4 py-2 text-xs font-medium text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded-lg transition-colors"
            >
              重试加载
            </button>
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
