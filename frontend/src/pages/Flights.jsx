import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTravel } from '../context/TravelContext';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Plane, ArrowRight, Calendar, Clock } from 'lucide-react';

const Flights = () => {
  const navigate = useNavigate();
  const { setFlightInfo } = useTravel();
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleParse = () => {
    if (!input.trim()) return;
    setIsParsing(true);
    
    // 模拟 AI 解析过程
    setTimeout(() => {
      setParsed({
        flightNo: 'JL088',
        from: '上海 PVG',
        to: '东京 HND',
        date: '2024-05-01',
        departure: '14:30',
        arrival: '18:30',
        terminal: 'T2'
      });
      setIsParsing(false);
    }, 1500);
  };

  const handleConfirm = () => {
    setFlightInfo(parsed);
    navigate('/plan');
  };

  const handleSkip = () => {
    navigate('/plan');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="text-primary" />
            航班信息
          </CardTitle>
          <p className="text-slate-500 text-sm">
            粘贴您的航班确认邮件或短信，我们将自动解析并添加到行程中。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!parsed ? (
            <>
              <textarea
                className="w-full h-40 p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-sm"
                placeholder="例如：您预订的 5月1日 JL088 航班已确认，14:30 从上海浦东起飞..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={handleSkip}>跳过</Button>
                <Button onClick={handleParse} disabled={isParsing || !input}>
                  {isParsing ? '解析中...' : '智能解析'}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-primary/5 p-4 border-b border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-primary">{parsed.flightNo}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border text-slate-500">已确认</span>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-800">{parsed.departure}</div>
                      <div className="text-sm text-slate-500">{parsed.from}</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center px-4">
                      <span className="text-xs text-slate-400 mb-1">3h 50m</span>
                      <div className="w-full h-[1px] bg-slate-300 relative">
                        <Plane size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400 rotate-90" />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-800">{parsed.arrival}</div>
                      <div className="text-sm text-slate-500">{parsed.to}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      {parsed.date}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      准点率 98%
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setParsed(null)}>重新输入</Button>
                <Button variant="accent" onClick={handleConfirm} className="w-full sm:w-auto">
                  确认并开始规划 <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Flights;
