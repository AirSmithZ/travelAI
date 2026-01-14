import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';
import { POI_DATA } from '../data/mockData';
import {
  createInitialItinerary,
  addPoiToDayInItinerary,
  removePoiFromItinerary,
  updateItineraryOrderForDay,
} from './travelUtils';

// 使用显式的 Context 默认值，有利于类型推断和可测试性
const TravelContext = createContext(undefined);

export const useTravel = () => {
  const context = useContext(TravelContext);
  if (!context) {
    throw new Error('useTravel 必须在 TravelProvider 中使用');
  }
  return context;
};

export const TravelProvider = ({ children }) => {
  // 偏好设置
  const [preferences, setPreferences] = useState({
    budget: [10000],
    interests: [],
    days: 5,
    travelers: 'couple', // solo, couple, family, friends
    destination: '东京' // 默认目的地
  });

  // 航班信息
  const [flightInfo, setFlightInfo] = useState(null);

  // 行程数据结构: { day1: [poi1, poi2], day2: [...] }
  const [itinerary, setItinerary] = useState({});

  // 聊天历史
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', content: '你好！我是你的 AI 旅行规划助手。告诉我你想去哪里，或者有什么特别的要求？' }
  ]);

  // 地图状态
  const [mapCenter, setMapCenter] = useState([35.6762, 139.6503]);
  const [mapZoom, setMapZoom] = useState(12);
  const [selectedPoi, setSelectedPoi] = useState(null);

  // 初始化行程：当目的地变化且尚未生成行程时，根据 POI 数据生成默认行程
  useEffect(() => {
    if (preferences.destination && Object.keys(itinerary).length === 0) {
      const nextItinerary = createInitialItinerary(
        POI_DATA,
        preferences.destination,
        preferences.days,
      );
      setItinerary(nextItinerary);
    }
  }, [preferences.destination]);

  const addPoiToDay = (poi, dayKey) => {
    setItinerary((prev) => addPoiToDayInItinerary(prev, dayKey, poi));
  };

  const removePoi = (dayKey, uniqueId) => {
    setItinerary((prev) => removePoiFromItinerary(prev, dayKey, uniqueId));
  };

  const updateItineraryOrder = (dayKey, newItems) => {
    setItinerary((prev) => updateItineraryOrderForDay(prev, dayKey, newItems));
  };

  const addChatMessage = (role, content) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  };

  return (
    <TravelContext.Provider value={{
      preferences, setPreferences,
      flightInfo, setFlightInfo,
      itinerary, setItinerary,
      chatHistory, addChatMessage,
      mapCenter, setMapCenter,
      mapZoom, setMapZoom,
      selectedPoi, setSelectedPoi,
      addPoiToDay, removePoi, updateItineraryOrder
    }}>
      {children}
    </TravelContext.Provider>
  );
};
