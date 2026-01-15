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

const STORAGE_KEY = 'travel_sessions_v1';

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
    budget: { min: 0, max: 10000 },
    interests: [],
    foodPreferences: [],
    flights: [], // 多程航班数组，每个元素: { departureAirport: string, arrivalAirport: string, departureTime: Date, returnTime: Date }
    travelers: 'couple', // solo, couple, family, friends
    destination: '北京', // 默认目的地
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

  // 会话列表与当前会话
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // 启动时从 localStorage 恢复会话列表（仅列表，不自动切换当前状态）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSessions(parsed);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('读取会话列表失败:', error);
    }
  }, []);

  // 初始化行程：当目的地变化且尚未生成行程时，根据 POI 数据生成默认行程
  useEffect(() => {
    if (preferences.destination && Object.keys(itinerary).length === 0) {
      // 根据航班信息计算天数
      let days = 5; // 默认值
      if (preferences.flights && preferences.flights.length > 0) {
        // 找到最早的出发时间和最晚的返回时间
        const firstFlight = preferences.flights[0];
        const lastFlight = preferences.flights[preferences.flights.length - 1];
        if (firstFlight?.departureTime && lastFlight?.returnTime) {
          const diffTime = lastFlight.returnTime.getTime() - firstFlight.departureTime.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            days = diffDays;
          }
        }
      }
      const nextItinerary = createInitialItinerary(
        POI_DATA,
        preferences.destination,
        days,
      );
      setItinerary(nextItinerary);
    }
  }, [preferences.destination, preferences.flights]);

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

  const persistSessions = (nextSessions) => {
    setSessions(nextSessions);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSessions));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('保存会话列表失败:', error);
    }
  };

  const createSessionSnapshot = () => {
    // 计算天数用于显示
    let days = 5;
    if (preferences.flights && preferences.flights.length > 0) {
      const firstFlight = preferences.flights[0];
      const lastFlight = preferences.flights[preferences.flights.length - 1];
      if (firstFlight?.departureTime && lastFlight?.returnTime) {
        const diffTime = lastFlight.returnTime.getTime() - firstFlight.departureTime.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          days = diffDays;
        }
      }
    }
    return {
      id: `${Date.now()}`,
      name: `${preferences.destination} · ${days}天行程`,
      createdAt: new Date().toISOString(),
      preferences,
      flightInfo,
      itinerary,
      chatHistory,
      mapCenter,
      mapZoom,
    };
  };

  const saveCurrentSession = () => {
    const snapshot = createSessionSnapshot();
    const nextSessions = [...sessions, snapshot];
    setCurrentSessionId(snapshot.id);
    persistSessions(nextSessions);
  };

  const loadSessionById = (sessionId) => {
    const target = sessions.find((item) => item.id === sessionId);
    if (!target) return;
    setCurrentSessionId(target.id);
    if (target.preferences) setPreferences(target.preferences);
    if (target.flightInfo) setFlightInfo(target.flightInfo);
    if (target.itinerary) setItinerary(target.itinerary);
    if (Array.isArray(target.chatHistory) && target.chatHistory.length > 0) {
      setChatHistory(target.chatHistory);
    }
    if (Array.isArray(target.mapCenter)) setMapCenter(target.mapCenter);
    if (typeof target.mapZoom === 'number') setMapZoom(target.mapZoom);
  };

  const deleteSessionById = (sessionId) => {
    const nextSessions = sessions.filter((item) => item.id !== sessionId);
    persistSessions(nextSessions);

    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
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
      addPoiToDay, removePoi, updateItineraryOrder,
      sessions,
      currentSessionId,
      saveCurrentSession,
      loadSessionById,
      deleteSessionById,
    }}>
      {children}
    </TravelContext.Provider>
  );
};
