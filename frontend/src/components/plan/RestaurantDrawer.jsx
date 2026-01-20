import React from 'react';
import { useTravel } from '../../context/TravelContext';
import { RESTAURANT_DATA } from '../../data/mockData';
import { X, Star, MapPin, Plus } from 'lucide-react';
import Button from '../ui/Button';

const RestaurantDrawer = ({ isOpen, onClose }) => {
  const { preferences, addPoiToDay } = useTravel();
  
  // 处理目的地（支持多选）
  const destinations = Array.isArray(preferences.destination) 
    ? preferences.destination 
    : preferences.destination 
      ? [preferences.destination] 
      : [];
  
  // 过滤当前城市的餐厅（显示所有选中城市的餐厅）
  const restaurants = RESTAURANT_DATA.filter(r => 
    destinations.length === 0 || destinations.includes(r.city)
  );

  const handleAdd = (restaurant) => {
    // 默认添加到第一天
    addPoiToDay({
      ...restaurant,
      category: '美食',
      duration: 90
    }, 'day1');
    // 提示用户（这里可以用 toast，简化起见省略）
  };

  return (
    <div className={`fixed inset-y-0 right-0 w-80 bg-slate-900/90 backdrop-blur shadow-2xl transform transition-transform duration-300 z-50 border-l border-slate-800/70 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/60">
          <h2 className="font-bold text-lg text-slate-100">🍽️ 探索美食</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-950/30 rounded-full">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {restaurants.map(rest => (
            <div key={rest.id} className="bg-slate-950/25 border border-slate-800/70 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="h-32 bg-slate-950/20 relative">
                <img 
                  src={`https://www.weavefox.cn/api/bolt/unsplash_image?keyword=${encodeURIComponent(rest.imageKeyword)}&width=300&height=200&random=${rest.id}`}
                  alt={rest.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-slate-900/85 border border-slate-800/70 px-2 py-1 rounded-full text-xs font-bold text-amber-300 flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> {rest.rating}
                </div>
              </div>
              <div className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-slate-100">{rest.name}</h3>
                  <span className="text-xs text-slate-200 bg-slate-950/30 border border-slate-800/70 px-2 py-0.5 rounded-full">{rest.cuisine}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
                  <MapPin size={12} /> 附近推荐
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-200">¥{rest.price}/人</span>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAdd(rest)}>
                    <Plus size={12} className="mr-1" /> 加入行程
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RestaurantDrawer;
