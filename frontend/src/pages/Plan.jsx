import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTravel } from '../context/TravelContext';
import { travelApi } from '../servers';
import { createSSEParser } from '../utils/sse';
import { useRequest } from '../utils/useRequest';
import ChatPanel from '../components/plan/ChatPanel';
import ItineraryPanel from '../components/plan/ItineraryPanel';
import MapPanel from '../components/plan/MapPanel';
import RestaurantDrawer from '../components/plan/RestaurantDrawer';
import Button from '../components/ui/Button';
import { Utensils, Share2, Menu, ArrowLeft, List, Trash2 } from 'lucide-react';
import { Modal } from 'antd';

const Plan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessions,
    currentSessionId,
    saveCurrentSession,
    loadSessionById,
    deleteSessionById,
    currentPlanId,
    setCurrentPlanId,
    isGenerating,
    setIsGenerating,
    setItinerary,
    setMapPoints,
    setMapCenter,
  } = useTravel();
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);
  // 用于避免重复启动：记录已请求的 key，防止重复请求
  const requestedKeysRef = useRef(new Set()); // 存储已请求过的 key
  const abortControllerRef = useRef(null);

  // 创建流式请求的 service 函数
  const streamItineraryService = async ({ planId, startDate, endDate, signal }) => {
    // 如果 signal 已经被 abort，直接返回
    if (signal?.aborted) {
      return Promise.resolve({ aborted: true });
    }

    const body = await travelApi.streamItinerary({
      planId,
      startDate,
      endDate,
      signal,
    });

    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');

    return new Promise((resolve, reject) => {
      const parser = createSSEParser((eventName, payload) => {
        if (eventName === 'day') {
          const items = [];
          const dayIt = payload.itinerary || {};
          const spots = Array.isArray(dayIt.spots) ? dayIt.spots : [];
          spots.forEach((s, idx) => {
            items.push({
              id: s.id || `spot_${payload.day_number}_${idx}`,
              uniqueId: `spot_${payload.day_number}_${idx}_${Date.now()}`,
              name: s.name || s.location || `景点${idx + 1}`,
              category: '景点',
              // 游玩时间：优先后端/LLM 给的 play_time_minutes，其次解析 recommended_time
              duration: typeof s.play_time_minutes === 'number'
                ? s.play_time_minutes
                : (s.recommended_time ? parseInt(s.recommended_time, 10) || 60 : 60),
              lat: typeof s.latitude === 'number' ? s.latitude : undefined,
              lng: typeof s.longitude === 'number' ? s.longitude : undefined,
            });
          });
          const rests = Array.isArray(dayIt.restaurants) ? dayIt.restaurants : [];
          rests.forEach((r, idx) => {
            items.push({
              id: r.id || `rest_${payload.day_number}_${idx}`,
              uniqueId: `rest_${payload.day_number}_${idx}_${Date.now()}`,
              name: r.name || `餐厅${idx + 1}`,
              category: '美食',
              duration: typeof r.play_time_minutes === 'number' ? r.play_time_minutes : 60,
              lat: typeof r.latitude === 'number' ? r.latitude : undefined,
              lng: typeof r.longitude === 'number' ? r.longitude : undefined,
            });
          });

          setItinerary((prev) => ({
            ...(prev || {}),
            [`day${payload.day_number}`]: items,
          }));
        }
        if (eventName === 'result') {
          // 构造地图节点：景点(蓝色) + 餐厅(红色) + 机场(绿色) + 住宿(棕色)
          const points = [];
          (payload.attractions || []).forEach((a, idx) => {
            if (a.latitude && a.longitude) {
              points.push({
                id: `a_${idx}`,
                name: a.name,
                lng: a.longitude,
                lat: a.latitude,
                category: '景点',
                duration: 90,
                rating: 4.6,
                imageKeyword: a.name,
              });
            }
          });
          (payload.restaurants || []).forEach((r, idx) => {
            if (r.latitude && r.longitude) {
              points.push({
                id: `r_${idx}`,
                name: r.name,
                lng: r.longitude,
                lat: r.latitude,
                category: '美食',
                duration: 60,
                rating: 4.5,
                imageKeyword: r.name,
              });
            }
          });
          (payload.flights || []).forEach((f, idx) => {
            if (f.latitude && f.longitude) {
              points.push({
                id: `f_${idx}`,
                name: f.departure_airport || f.arrival_airport || '机场',
                lng: f.longitude,
                lat: f.latitude,
                category: '机场',
                duration: 0,
                rating: 0,
                imageKeyword: f.departure_airport || 'airport',
              });
            }
          });
          (payload.accommodations || []).forEach((a, idx) => {
            if (a.latitude && a.longitude) {
              points.push({
                id: `ac_${idx}`,
                name: a.address || a.city || '住宿',
                lng: a.longitude,
                lat: a.latitude,
                category: '住宿',
                duration: 0,
                rating: 0,
                imageKeyword: a.city || 'hotel',
              });
            }
          });
          if (points.length > 0) {
            setMapPoints(points);
            setMapCenter([points[0].lat, points[0].lng]);
          }
          setIsGenerating(false);
          resolve({ success: true });
        }
        if (eventName === 'error') {
          // 出错也结束 loading
          // eslint-disable-next-line no-console
          console.error('行程生成出错:', payload);
          setIsGenerating(false);
          reject(new Error(payload.message || '行程生成出错'));
        }
      });

      const readStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // 正常结束（服务器关闭连接）
              resolve({ success: true });
              break;
            }
            parser.push(decoder.decode(value, { stream: true }));
          }
        } catch (e) {
          // StrictMode/页面切换导致的 abort 属于正常行为：不当作错误
          if (e?.name === 'AbortError' || signal?.aborted) {
            resolve({ aborted: true });
            return;
          }
          reject(e);
        }
      };

      readStream();
    });
  };

  // 使用 useRequest 管理流式请求
  const { run: runStreamItinerary } = useRequest(
    ({ planId, startDate, endDate, signal }) =>
      streamItineraryService({ planId, startDate, endDate, signal }),
    {
      manual: true,
      onSuccess: () => {
        // 请求成功完成
      },
      onError: (error) => {
        // AbortError 是正常的取消行为，不需要处理
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          return;
        }
        // 其他错误才设置 isGenerating 为 false 并打印日志
        setIsGenerating(false);
        // eslint-disable-next-line no-console
        console.error('流式生成失败:', error);
      },
    }
  );

  // 当从 Onboarding 跳转过来、且标记为 isGenerating 时，在此页启动流式路线生成
  useEffect(() => {
    const state = location.state || {};
    if (!currentPlanId || !isGenerating) return;
    // 若没有日期参数，则不要启动（否则会发出无效请求导致一直 pending）
    if (!state.startDate || !state.endDate) return;

    const key = `${currentPlanId}:${state.startDate}:${state.endDate}`;
    
    // 防止重复请求：如果这个 key 已经请求过，直接返回
    if (requestedKeysRef.current.has(key)) {
      return;
    }

    // 先 abort 之前的请求（如果存在）
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (e) {
        // ignore
      }
    }

    const startDate = state.startDate;
    const endDate = state.endDate;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 立即标记为已请求，防止重复启动
    requestedKeysRef.current.add(key);

    // 使用 useRequest 的 run 方法启动流式请求
    runStreamItinerary({
      planId: currentPlanId,
      startDate,
      endDate,
      signal: controller.signal,
    }).then(() => {
      // 请求成功完成，保持 key 在 Set 中，防止重复请求
    }).catch((e) => {
      // 如果是 abort 错误，允许重新请求（清理 key）
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        requestedKeysRef.current.delete(key);
      }
      // 其他错误也保持 key，防止重复请求
    });

    return () => {
      // cleanup 时 abort 当前请求
      if (abortControllerRef.current === controller) {
        try {
          controller.abort();
          abortControllerRef.current = null;
          // 清理 key，允许重新请求（如果组件重新挂载或依赖项变化）
          requestedKeysRef.current.delete(key);
        } catch (e) {
          // ignore
        }
      }
    };
    // 移除 runStreamItinerary 等函数依赖，只保留必要的状态依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlanId, isGenerating, location.state?.startDate, location.state?.endDate]);

  const handleOpenRestaurant = () => {
    setIsRestaurantOpen(true);
  };

  const handleCloseRestaurant = () => {
    setIsRestaurantOpen(false);
  };

  const handleToggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const handleGoShare = () => {
    navigate('/share');
  };

  const handleToggleSessionDrawer = () => {
    setIsSessionDrawerOpen((prev) => !prev);
  };

  const handleSaveSession = () => {
    saveCurrentSession();
  };

  const handleSelectSession = (sessionId) => {
    loadSessionById(sessionId);
  };

  const handleBack = () => {
    Modal.confirm({
      title: '确认返回',
      content: '确认返回到初始设置页？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        navigate('/');
      },
    });
  };

  const handleDeleteSession = (sessionId) => {
    const target = sessions.find((item) => item.id === sessionId);
    Modal.confirm({
      title: '删除会话',
      content: `确定要删除「${target?.name || '该会话'}」吗？删除后将无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        deleteSessionById(sessionId);
      },
    });
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden relative">
      {isGenerating && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-primary/40 border-t-primary rounded-full animate-spin mb-4" />
          <div className="text-slate-700 text-sm">AI 正在为你生成路线，请稍候...</div>
        </div>
      )}
      {/* Header */}
      <header className="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-white z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600"
            onClick={handleBack}
          >
            <ArrowLeft size={16} className="mr-1" />
            返回首页
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
              TP
            </div>
            <h1 className="font-bold text-slate-800 hidden sm:block">TravelPlanner AI</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600"
            onClick={handleOpenRestaurant}
          >
            <Utensils size={18} className="mr-2" /> <span className="hidden sm:inline">附近美食</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600"
            onClick={handleToggleSessionDrawer}
          >
            <List size={18} className="mr-1" />
            会话
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleGoShare}
          >
            <Share2 size={16} className="mr-2" /> 保存分享
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Itinerary */}
        <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block absolute md:relative z-10 h-full w-full md:w-auto bg-white`}>
           <ItineraryPanel />
        </div>

        {/* Center/Right Panel: Chat & Map */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Chat Overlay */}
          <div className="absolute top-4 left-4 right-4 md:left-10 md:right-auto md:w-[400px] z-[400] shadow-xl rounded-xl overflow-hidden border border-slate-200/50">
            <ChatPanel />
          </div>

          {/* Map */}
          <div className="flex-1 bg-slate-100">
            <MapPanel />
          </div>
        </div>

        {/* Restaurant Drawer */}
        <RestaurantDrawer isOpen={isRestaurantOpen} onClose={handleCloseRestaurant} />

        {/* Session Drawer - 右侧会话抽屉 */}
        <div
          className={`fixed inset-y-14 right-0 w-72 bg-white border-l border-slate-200 shadow-2xl z-30 transform transition-transform duration-300 ${
            isSessionDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <List size={16} className="text-slate-600" />
                <span className="text-sm font-semibold text-slate-800">会话列表</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleSaveSession}
                >
                  保存当前
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sessions.length === 0 && (
                <div className="text-xs text-slate-400">
                  暂无会话，点击「保存当前」创建一个。
                </div>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-xs transition-colors ${
                    currentSessionId === session.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className="truncate font-medium">{session.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(session.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-red-400 hover:text-red-600"
                    onClick={() => handleDeleteSession(session.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Plan;
