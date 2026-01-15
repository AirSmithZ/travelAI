import React from 'react';
import { useTravel } from '../../context/TravelContext';
import { RESTAURANT_DATA } from '../../data/mockData';
import { X, Star, MapPin, Plus } from 'lucide-react';
import Button from '../ui/Button';

const RestaurantDrawer = ({ isOpen, onClose }) => {
  const { preferences, addPoiToDay } = useTravel();
  
  // 过滤当前城市的餐厅
  const restaurants = RESTAURANT_DATA.filter(r => r.city === preferences.destination);

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
    <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 z-50 border-l border-slate-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-lg text-slate-800">探索美食</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {restaurants.map(rest => (
            <div key={rest.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="h-32 bg-slate-100 relative">
                <img 
                  src={`https://www.weavefox.cn/api/bolt/unsplash_image?keyword=${encodeURIComponent(rest.imageKeyword)}&width=300&height=200&random=${rest.id}`}
                  alt={rest.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-bold text-amber-500 flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> {rest.rating}
                </div>
              </div>
              <div className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-slate-800">{rest.name}</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{rest.cuisine}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                  <MapPin size={12} /> 距离市中心 1.2km
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">¥{rest.price}/人</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAdd(rest)}>
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
