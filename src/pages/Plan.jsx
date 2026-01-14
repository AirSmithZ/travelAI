import React, { useState } from 'react';
import { useTravel } from '../context/TravelContext';
import ChatPanel from '../components/plan/ChatPanel';
import ItineraryPanel from '../components/plan/ItineraryPanel';
import MapPanel from '../components/plan/MapPanel';
import RestaurantDrawer from '../components/plan/RestaurantDrawer';
import Button from '../components/ui/Button';
import { Utensils, Share2, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Plan = () => {
  const navigate = useNavigate();
  const [isRestaurantOpen, setIsRestaurantOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-white z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            TP
          </div>
          <h1 className="font-bold text-slate-800 hidden sm:block">TravelPlanner AI</h1>
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
      </div>
    </div>
  );
};

export default Plan;
