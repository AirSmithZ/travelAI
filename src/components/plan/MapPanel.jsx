import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { useTravel } from '../../context/TravelContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Marker Icons
const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
};

const MapPanel = () => {
  const { mapCenter, mapZoom, itinerary, selectedPoi } = useTravel();

  // 收集所有点用于绘制连线
  const allPoints = Object.values(itinerary).flat();
  const polylinePositions = allPoints.map(p => [p.lat, p.lng]);

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={mapCenter} zoom={mapZoom} />

        {/* 绘制路线 */}
        <Polyline 
          positions={polylinePositions} 
          pathOptions={{ color: '#2B6CB0', weight: 3, dashArray: '10, 10', opacity: 0.6 }} 
        />

        {/* 绘制 POI 标记 */}
        {allPoints.map((poi) => (
          <Marker 
            key={poi.uniqueId} 
            position={[poi.lat, poi.lng]}
            icon={createCustomIcon(poi.category === '美食' ? '#F56565' : '#2B6CB0')}
          >
            <Popup className="custom-popup">
              <div className="p-1">
                <div className="w-full h-24 mb-2 rounded overflow-hidden bg-slate-100">
                  <img 
                    src={`https://www.weavefox.cn/api/bolt/unsplash_image?keyword=${encodeURIComponent(poi.imageKeyword || poi.name)}&width=200&height=150&random=${poi.id}`}
                    alt={poi.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-bold text-sm">{poi.name}</h3>
                <p className="text-xs text-slate-500">{poi.category} · 建议停留 {poi.duration} 分钟</p>
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-500">
                  ★ {poi.rating}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Legend */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-3 rounded-lg shadow-md border border-slate-200 text-xs space-y-2 z-[1000]">
        <div className="font-semibold mb-1">图例</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#2B6CB0] border border-white shadow-sm"></div>
          <span>景点</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#F56565] border border-white shadow-sm"></div>
          <span>美食</span>
        </div>
      </div>
    </div>
  );
};

export default MapPanel;
