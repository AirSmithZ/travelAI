import React, { useState } from 'react';
import { useTravel } from '../context/TravelContext';
import ChatPanel from '../components/plan/ChatPanel';
import ItineraryPanel from '../components/plan/ItineraryPanel';
import MapPanel from '../components/plan/MapPanel';
import RestaurantDrawer from '../components/plan/RestaurantDrawer';
import Button from '../components/ui/Button';
import { Utensils, Share2, Menu, ArrowLeft, List, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from 'antd';

const Plan = () => {
  const navigate = useNavigate();
  const {
    sessions,
    currentSessionId,
    saveCurrentSession,
    loadSessionById,
    deleteSessionById,
  } = useTravel();
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);

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
    <div className="h-screen flex flex-col bg-white overflow-hidden">
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
