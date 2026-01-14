import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTravel } from '../context/TravelContext';
import { INTEREST_TAGS, CITIES } from '../data/mockData';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import * as Slider from '@radix-ui/react-slider';
import { Check, Plane, Users } from 'lucide-react';

const Onboarding = () => {
  const navigate = useNavigate();
  const { preferences, setPreferences } = useTravel();
  const [step, setStep] = useState(1);

  const handleInterestToggle = (tag) => {
    setPreferences(prev => {
      const exists = prev.interests.includes(tag);
      return {
        ...prev,
        interests: exists 
          ? prev.interests.filter(t => t !== tag)
          : [...prev.interests, tag]
      };
    });
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      navigate('/flights');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 opacity-10">
        <img 
          src="https://www.weavefox.cn/api/bolt/unsplash_image?keyword=travel,map&width=1920&height=1080&random=bg" 
          alt="background" 
          className="w-full h-full object-cover"
        />
      </div>

      <Card className="w-full max-w-2xl z-10 shadow-xl border-t-4 border-primary">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary">步骤 {step} / 3</span>
            <Plane className="text-primary h-6 w-6" />
          </div>
          <CardTitle className="text-3xl text-slate-800">
            {step === 1 && "让我们开始规划您的梦想之旅"}
            {step === 2 && "您的旅行偏好"}
            {step === 3 && "还有谁与您同行？"}
          </CardTitle>
          <p className="text-slate-500 mt-2">
            {step === 1 && "首先，请选择您的目的地和预算范围。"}
            {step === 2 && "选择您感兴趣的活动，AI 将为您定制行程。"}
            {step === 3 && "最后确认一些细节。"}
          </p>
        </CardHeader>
        <CardContent className="space-y-8 mt-4">
          
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">目的地</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.keys(CITIES).map(city => (
                    <button
                      key={city}
                      onClick={() => setPreferences(p => ({ ...p, destination: city }))}
                      className={`p-3 rounded-lg border text-sm transition-all ${
                        preferences.destination === city 
                          ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary' 
                          : 'border-slate-200 hover:border-primary/50'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-4 text-slate-700">
                  预算范围: ¥0 - ¥{preferences.budget[0].toLocaleString()}
                </label>
                <Slider.Root
                  className="relative flex items-center select-none touch-none w-full h-5"
                  value={preferences.budget}
                  max={50000}
                  step={1000}
                  onValueChange={(val) => setPreferences(p => ({ ...p, budget: val }))}
                >
                  <Slider.Track className="bg-slate-200 relative grow rounded-full h-[3px]">
                    <Slider.Range className="absolute bg-primary rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-5 h-5 bg-white border-2 border-primary shadow-[0_2px_10px] shadow-black/10 rounded-[10px] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="Volume"
                  />
                </Slider.Root>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-sm font-medium mb-3 text-slate-700">兴趣标签 (多选)</label>
              <div className="flex flex-wrap gap-3">
                {INTEREST_TAGS.map(tag => {
                  const isSelected = preferences.interests.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => handleInterestToggle(tag)}
                      className={`px-4 py-2 rounded-full text-sm transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'bg-primary text-white shadow-md transform scale-105'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected && <Check size={14} />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">出行天数</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1" 
                    max="15" 
                    value={preferences.days}
                    onChange={(e) => setPreferences(p => ({ ...p, days: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-xl font-bold text-primary w-12 text-center">{preferences.days} 天</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">同行人员</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'solo', label: '独自一人', icon: Users },
                    { id: 'couple', label: '情侣/夫妻', icon: Users },
                    { id: 'family', label: '亲子家庭', icon: Users },
                    { id: 'friends', label: '朋友结伴', icon: Users },
                  ].map(type => (
                    <button
                      key={type.id}
                      onClick={() => setPreferences(p => ({ ...p, travelers: type.id }))}
                      className={`p-4 rounded-lg border flex items-center gap-3 transition-all ${
                        preferences.travelers === type.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <type.icon size={20} />
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t">
            <Button 
              variant="ghost" 
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              上一步
            </Button>
            <Button onClick={handleNext} variant="accent" className="px-8">
              {step === 3 ? '生成行程' : '下一步'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
