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
import { Utensils, Share2, ArrowLeft, FolderOpen, Trash2, X, Compass, Sparkles, Bookmark, Bot } from 'lucide-react';
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
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
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
      let tokenCount = 0;
      let lastTokenPreview = '';
      let tokenLogTimer = null;
      let streamingActive = true;
      const parser = createSSEParser((eventName, payload) => {
        // 调试：token 非常多，console.log 会显著拖慢主线程（DevTools 渲染/格式化很重）
        // 这里改为“按时间节流”打印，避免控制台成为瓶颈
        if (eventName === 'token') {
          tokenCount += 1;
          lastTokenPreview = String(payload?.delta ?? '').replace(/\s+/g, ' ').slice(0, 60);
          if (!tokenLogTimer) {
            tokenLogTimer = setTimeout(() => {
              tokenLogTimer = null;
              if (!streamingActive) return;
              // eslint-disable-next-line no-console
              console.log('[SSE token]', `count=${tokenCount}`, `last="${lastTokenPreview}"`);
            }, 800);
          }
          return;
        }
        if (eventName === 'heartbeat') return;

        // eslint-disable-next-line no-console
        console.log('[SSE]', eventName, payload);
        if (eventName === 'day') {
          // 后端返回 items（按早/中/晚分组）：{ morning:[], afternoon:[], evening:[] }
          const grouped = payload.items && typeof payload.items === 'object' ? payload.items : {};
          const nextDay = {
            morning: Array.isArray(grouped.morning) ? grouped.morning : [],
            afternoon: Array.isArray(grouped.afternoon) ? grouped.afternoon : [],
            evening: Array.isArray(grouped.evening) ? grouped.evening : [],
            start_point: payload.start_point || null, // 当天的起始点（住宿或机场）
            end_point: payload.end_point || null, // 当天的终止点（住宿或机场）
          };
          // eslint-disable-next-line no-console
          console.log('[SSE day]', {
            day_number: payload.day_number,
            groupedCount: {
              morning: nextDay.morning.length,
              afternoon: nextDay.afternoon.length,
              evening: nextDay.evening.length,
            },
            stats: payload.stats,
            start_point: nextDay.start_point,
            end_point: nextDay.end_point,
          });
          setItinerary((prev) => ({
            ...(prev || {}),
            [`day${payload.day_number}`]: nextDay,
          }));
        }
        if (eventName === 'result') {
          streamingActive = false;
          if (tokenLogTimer) {
            clearTimeout(tokenLogTimer);
            tokenLogTimer = null;
          }
          // eslint-disable-next-line no-console
          console.log('[SSE result]', payload);
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
          streamingActive = false;
          if (tokenLogTimer) {
            clearTimeout(tokenLogTimer);
            tokenLogTimer = null;
          }
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
    setIsSessionDrawerOpen((prev) => {
      if (!prev) {
        // 打开SessionDrawer时，关闭ChatDrawer
        setIsChatDrawerOpen(false);
      }
      return !prev;
    });
  };

  const handleToggleChatDrawer = () => {
    setIsChatDrawerOpen((prev) => {
      if (!prev) {
        // 打开ChatDrawer时，关闭SessionDrawer
        setIsSessionDrawerOpen(false);
      }
      return !prev;
    });
  };

  const handleSaveSession = () => {
    saveCurrentSession();
  };

  const handleSelectSession = (sessionId) => {
    loadSessionById(sessionId);
  };

  const handleBack = () => {
    Modal.confirm({
      title: '🔙 确认返回',
      content: '确认返回到初始设置页？（未保存的修改将不会保留）',
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
      title: '🗑️ 删除会话',
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
    <div className="tp-plan h-screen flex flex-col bg-slate-950 overflow-hidden relative">
      {isGenerating && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/55 backdrop-blur-md opacity-80">
          <div className="bg-slate-900/80 rounded-3xl p-8 shadow-2xl border border-slate-800/70 text-center max-w-sm">
            <div className="w-16 h-16 border-4 border-slate-700/80 border-t-sky-400 rounded-full animate-spin mx-auto mb-6" />
            <h3 className="text-lg font-bold text-slate-50 mb-2">AI 正在规划行程</h3>
            <p className="text-sm text-slate-300">正在为您生成个性化旅行路线...</p>
            <div className="mt-6 flex items-center justify-center gap-1">
              <div className="w-2 h-2 bg-sky-400/90 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-sky-400/90 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-sky-400/90 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      {/* Header - 精致深色玻璃风格 */}
      <header className="h-14 border-b border-slate-800/60 flex items-center justify-between px-4 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-950/95 backdrop-blur-xl z-20 shadow-lg shadow-slate-950/30">
        {/* Left: Back + Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-all duration-200"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium hidden sm:inline">返回</span>
          </button>

          <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-700/60 to-transparent" />

          <div className="flex items-center gap-2.5">
            {/* Logo */}
            <div className="relative">
              <div className="w-9 h-9 bg-gradient-to-br from-sky-400 via-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/25 ring-1 ring-white/10">
                <Compass size={18} className="text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <Sparkles size={6} className="text-slate-900" />
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-50 tracking-tight leading-none">TravelPlanner</h1>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">✨ AI 智能规划</p>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* 附近美食 */}
          <button
            type="button"
            onClick={handleOpenRestaurant}
            className="group flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all duration-200"
          >
            <Utensils size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium hidden md:inline">附近美食</span>
          </button>

          {/* AI 旅行助手 */}
          <button
            type="button"
            onClick={handleToggleChatDrawer}
            className="group flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all duration-200"
          >
            <Bot size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium hidden md:inline">AI 助手</span>
          </button>

          {/* 会话 */}
          <button
            type="button"
            onClick={handleToggleSessionDrawer}
            className="group flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 border border-transparent hover:border-sky-500/20 transition-all duration-200"
          >
            <FolderOpen size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium hidden md:inline">会话</span>
          </button>

          <div className="h-5 w-px bg-slate-800/80 mx-1" />

          {/* 保存分享 - CTA */}
          <button
            type="button"
            onClick={handleGoShare}
            className="group relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-white font-medium text-xs bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-lg shadow-sky-500/25 hover:shadow-sky-400/30 transition-all duration-200 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            <Bookmark size={14} className="relative z-10" />
            <span className="relative z-10">保存分享</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel: Itinerary */}
        <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block absolute md:relative z-10 h-full w-full md:w-auto`}>
           <ItineraryPanel />
        </div>

        {/* Center/Right Panel: Map */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Map */}
          <div className="flex-1 bg-slate-950">
            <MapPanel />
          </div>
        </div>

        {/* Restaurant Drawer */}
        <RestaurantDrawer isOpen={isRestaurantOpen} onClose={handleCloseRestaurant} />

        {/* Backdrop for drawers */}
        <div
          className={`fixed inset-0 z-20 transition-opacity duration-300 ${
            (isSessionDrawerOpen || isChatDrawerOpen) ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => {
            setIsSessionDrawerOpen(false);
            setIsChatDrawerOpen(false);
          }}
          role="button"
          tabIndex={-1}
          aria-label="close drawers"
        >
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" />
        </div>

        {/* Chat Drawer - AI 旅行助手 - 右侧抽屉 */}
        <div
          className={`fixed inset-y-14 right-0 w-96 bg-slate-900/95 border-l border-slate-800/50 shadow-2xl z-[35] transform transition-transform duration-300 backdrop-blur-xl ${
            isChatDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-800/60 flex items-center justify-between gap-2 bg-gradient-to-r from-purple-500/8 to-pink-500/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                  <Bot size={16} className="text-purple-400" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-100">🤖 AI 旅行助手</span>
                  <div className="text-[10px] text-slate-500 mt-0.5">随时告诉我你的想法，我会帮你调整路线</div>
                </div>
              </div>
              <button
                type="button"
                className="h-7 w-7 rounded-lg bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors grid place-items-center"
                onClick={() => setIsChatDrawerOpen(false)}
                aria-label="close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel />
            </div>
          </div>
        </div>

        {/* Session Drawer - 右侧会话抽屉 */}
        <div
          className={`fixed inset-y-14 right-0 w-80 bg-slate-900/95 border-l border-slate-800/50 shadow-2xl z-30 transform transition-transform duration-300 backdrop-blur-xl ${
            isSessionDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-800/60 flex items-center justify-between gap-2 bg-gradient-to-r from-sky-500/8 to-indigo-500/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                  <FolderOpen size={16} className="text-sky-400" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-100">会话列表</span>
                  <div className="text-[10px] text-slate-500 mt-0.5">保存/切换不同的行程版本</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="h-7 px-3 rounded-lg text-[11px] font-medium text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 transition-colors"
                  onClick={handleSaveSession}
                >
                  + 保存当前
                </button>
                <button
                  type="button"
                  className="h-7 w-7 rounded-lg bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors grid place-items-center"
                  onClick={() => setIsSessionDrawerOpen(false)}
                  aria-label="close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {sessions.length === 0 && (
                <div className="text-center py-8">
                  <FolderOpen size={32} className="text-slate-700 mx-auto mb-3" />
                  <div className="text-xs text-slate-500">暂无保存的会话</div>
                  <div className="text-[10px] text-slate-600 mt-1">点击上方「保存当前」创建</div>
                </div>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs transition-all duration-200 ${
                    currentSessionId === session.id
                      ? 'border-sky-500/50 bg-sky-500/10 text-sky-200 shadow-lg shadow-sky-500/10'
                      : 'border-slate-800/70 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className="truncate font-medium">{session.name}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {new Date(session.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
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
