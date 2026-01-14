import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTravel } from '../context/TravelContext';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { CheckCircle, Download, Link, ArrowLeft } from 'lucide-react';

const Share = () => {
  const navigate = useNavigate();
  const { preferences, itinerary } = useTravel();
  
  // 计算天数
  let days = 5; // 默认值
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

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="text-green-600 w-8 h-8" />
          </div>
          <CardTitle className="text-2xl text-slate-800">行程已准备就绪！</CardTitle>
          <p className="text-slate-500">您的 {preferences.destination} {days} 日游规划已生成</p>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-lg">{preferences.destination}深度游</h3>
                <p className="text-sm text-slate-500">
                  共 {Object.values(itinerary).flat().length} 个景点 · 预算 ¥
                  {preferences.budget.min} - ¥{preferences.budget.max}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{days}</div>
                <div className="text-xs text-slate-400">天数</div>
              </div>
            </div>
            
            <div className="space-y-4">
              {Object.keys(itinerary).slice(0, 3).map((day, idx) => (
                <div key={day} className="flex gap-4">
                  <div className="w-12 text-sm font-bold text-slate-400 pt-1">Day {idx + 1}</div>
                  <div className="flex-1 space-y-2">
                    {itinerary[day].map(poi => (
                      <div key={poi.uniqueId} className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded border border-slate-100">
                        {poi.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(itinerary).length > 3 && (
                <div className="text-center text-sm text-slate-400 pt-2">...以及更多</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button variant="outline" className="h-12">
              <Link size={18} className="mr-2" /> 复制分享链接
            </Button>
            <Button variant="outline" className="h-12">
              <Download size={18} className="mr-2" /> 导出 PDF
            </Button>
          </div>

          <div className="text-center">
            <Button variant="ghost" onClick={() => navigate('/plan')}>
              <ArrowLeft size={16} className="mr-2" /> 返回编辑
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Share;
