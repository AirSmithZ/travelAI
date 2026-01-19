import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTravel } from '../context/TravelContext';
import { INTEREST_TAGS, CUISINES } from '../data/mockData';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Plane, Users, Plus, X } from 'lucide-react';
import { Tag, Input } from 'antd';
import LocationSelect from '../components/plan/LocationSelect';
import FlightInput from '../components/plan/FlightInput';
import AddressInput from '../components/plan/AddressInput';
import { useRequest } from '../utils/useRequest';
import { travelApi } from '../servers';

const Onboarding = () => {
  const navigate = useNavigate();
  const { preferences, setPreferences, setItinerary, setCurrentPlanId, setIsGenerating } = useTravel();
  const [step, setStep] = useState(1);
  const [interestOptions, setInterestOptions] = useState(INTEREST_TAGS);
  const [newInterest, setNewInterest] = useState('');
  const [foodOptions, setFoodOptions] = useState(CUISINES);
  const [newFood, setNewFood] = useState('');
  const [newNoteLink, setNewNoteLink] = useState('');

  const { runAsync: createPlan } = useRequest(
    (payload) => travelApi.createPlan(payload),
    { manual: true, debounceWait: 400 },
  );

  const handleMockFill = () => {
    const mock = {
      destination: ['新加坡'],
      budget: { min: 0, max: 20000 },
      interests: ['自然风光', '动物园'],
      foodPreferences: ['中餐', '烧烤'],
      travelers: 'couple',
      xiaohongshuNotes: [
        '旅游路线参考 第一天 1.国家博物馆National Museum of... http://xhslink.com/o/2XWnPVDqS50  复制后打开【小红书】查看笔记！',
      ],
      addresses: [
        {
          // AddressInput 里 city 可能是对象（含 name）或字符串，这里给字符串即可
          city: '新加坡',
          address: '武吉士酒店',
        },
      ],
      flights: [
        {
          departureAirport: '樟宜机场',
          arrivalAirport: '樟宜机场',
          departureTime: new Date('2026-01-18T16:00:00.000Z'),
          returnTime: new Date('2026-01-22T16:00:00.000Z'),
        },
      ],
    };

    setPreferences((prev) => ({
      ...prev,
      ...mock,
    }));
    // 方便直接点击生成
    setStep(2);
  };

  const handleInterestToggle = (tag) => {
    setPreferences((prev) => {
      const exists = prev.interests.includes(tag);
      return {
        ...prev,
        interests: exists
          ? prev.interests.filter((t) => t !== tag)
          : [...prev.interests, tag],
      };
    });
  };

  const handleInterestRemove = (tag) => {
    setInterestOptions((opts) => opts.filter((t) => t !== tag));
    setPreferences((prev) => ({
      ...prev,
      interests: prev.interests.filter((t) => t !== tag),
    }));
  };

  const handleAddInterest = () => {
    const value = newInterest.trim();
    if (!value) return;
    setInterestOptions((opts) =>
      opts.includes(value) ? opts : [...opts, value]
    );
    setPreferences((prev) => ({
      ...prev,
      interests: prev.interests.includes(value)
        ? prev.interests
        : [...prev.interests, value],
    }));
    setNewInterest('');
  };

  const handleFoodToggle = (tag) => {
    setPreferences((prev) => {
      const exists = prev.foodPreferences.includes(tag);
      return {
        ...prev,
        foodPreferences: exists
          ? prev.foodPreferences.filter((t) => t !== tag)
          : [...prev.foodPreferences, tag],
      };
    });
  };

  const handleFoodRemove = (tag) => {
    setFoodOptions((opts) => opts.filter((t) => t !== tag));
    setPreferences((prev) => ({
      ...prev,
      foodPreferences: prev.foodPreferences.filter((t) => t !== tag),
    }));
  };

  const handleAddFood = () => {
    const value = newFood.trim();
    if (!value) return;
    setFoodOptions((opts) =>
      opts.includes(value) ? opts : [...opts, value]
    );
    setPreferences((prev) => ({
      ...prev,
      foodPreferences: prev.foodPreferences.includes(value)
        ? prev.foodPreferences
        : [...prev.foodPreferences, value],
    }));
    setNewFood('');
  };

  const handleAddNoteLink = () => {
    const value = newNoteLink.trim();
    if (!value) return;
    setPreferences((prev) => ({
      ...prev,
      xiaohongshuNotes: prev.xiaohongshuNotes?.includes(value)
        ? prev.xiaohongshuNotes
        : [...(prev.xiaohongshuNotes || []), value],
    }));
    setNewNoteLink('');
  };

  const handleRemoveNoteLink = (link) => {
    setPreferences((prev) => ({
      ...prev,
      xiaohongshuNotes: prev.xiaohongshuNotes?.filter((l) => l !== link) || [],
    }));
  };

  const handleBudgetMinChange = (e) => {
    const raw = e.target.value;
    const parsed = parseInt(raw, 10);
    let value = Number.isNaN(parsed) ? 0 : parsed;
    if (value < 0) value = 0;
    setPreferences((prev) => {
      const next = { ...prev.budget };
      next.min = value;
      if (next.min > next.max) {
        next.max = next.min;
      }
      return { ...prev, budget: next };
    });
  };

  const handleBudgetMaxChange = (e) => {
    const raw = e.target.value;
    const parsed = parseInt(raw, 10);
    let value = Number.isNaN(parsed) ? 0 : parsed;
    if (value < 0) value = 0;
    setPreferences((prev) => {
      const next = { ...prev.budget };
      next.max = value;
      if (next.max < next.min) {
        next.min = next.max;
      }
      return { ...prev, budget: next };
    });
  };

  const handleNext = async () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      // 整合表单数据
      // 归一化航班：只保留有出发时间的条目，并转成字符串
      const normalizedFlights = (preferences.flights || [])
        .filter((f) => f && f.departureTime) // 没有时间的丢弃，避免后端 422
        .map((flight) => ({
          departureAirport: flight.departureAirport || '',
          arrivalAirport: flight.arrivalAirport || '',
          departureTime: flight.departureTime ? flight.departureTime.toISOString() : null,
          returnTime: flight.returnTime ? flight.returnTime.toISOString() : null,
        }));

      const formData = {
        destination: Array.isArray(preferences.destination) 
          ? preferences.destination 
          : preferences.destination 
            ? [preferences.destination] 
            : [],
        budget: {
          min: preferences.budget.min,
          max: preferences.budget.max,
        },
        interests: preferences.interests,
        foodPreferences: preferences.foodPreferences,
        travelers: preferences.travelers,
        xiaohongshuNotes: preferences.xiaohongshuNotes || [],
        addresses: (preferences.addresses || []).map((addr) => ({
          city: addr.city ? (typeof addr.city === 'string' ? addr.city : addr.city.name) : '',
          address: addr.address || '',
        })),
        flights: normalizedFlights,
      };

      // 打印整合的接口数据
      console.log('整合的表单数据:', JSON.stringify(formData, null, 2));
      console.log('发送到 API 的数据:', formData);
      try {
        const createdPlan = await createPlan(formData);
        console.log('创建旅行规划成功:', createdPlan);

        // 缓存当前 planId，后续在地图页触发流式生成
        setCurrentPlanId(createdPlan.id);
        // 进入新的一次生成前，清空上一次流式状态，避免 Plan 页误判 done/running
        setItinerary({});

        // 计算日期范围：优先使用航班时间，否则默认 5 天（在 Plan 页使用）
        const flights = preferences.flights || [];
        let startDate = new Date();
        let endDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
        if (flights.length > 0 && flights[0]?.departureTime) {
          startDate = flights[0].departureTime;
        }
        if (flights.length > 0 && flights[flights.length - 1]?.returnTime) {
          endDate = flights[flights.length - 1].returnTime;
        }
        // 标记为需要在下一页生成路线
        setIsGenerating(true);

        // 请求成功后直接跳转到地图页，由 Plan 页触发流式生成
        navigate('/plan', {
          state: {
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
          },
        });
      } catch (error) {
        console.error('发送请求失败:', error);
        // 即使请求失败，也允许回到首页或保持当前页，这里先简单回首页
        navigate('/');
      }
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
            <span className="text-sm font-medium text-primary">步骤 {step} / 2</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMockFill}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
              >
                Mock 填充
              </button>
              <Plane className="text-primary h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-3xl text-slate-800">
            {step === 1 && '让我们开始规划您的梦想之旅'}
            {step === 2 && '完善您的旅行偏好'}
          </CardTitle>
          <p className="text-slate-500 mt-2">
            {step === 1 && '请选择目的地、出行时间和航班信息，AI 将为您定制行程。'}
            {step === 2 && '最后确认预算、兴趣和同行人员。'}
          </p>
        </CardHeader>
        <CardContent className="space-y-8 mt-4">
          
          {step === 1 && (
            <div className="space-y-6">
              <LocationSelect
                value={preferences.destination}
                onChange={(cities) =>
                  setPreferences((p) => ({
                    ...p,
                    destination: cities.map(c => c.name || c),
                  }))
                }
              />

              <AddressInput
                addresses={preferences.addresses && preferences.addresses.length > 0 
                  ? preferences.addresses 
                  : [{ city: null, address: '' }]}
                onChange={(addresses) =>
                  setPreferences((p) => ({
                    ...p,
                    addresses,
                  }))
                }
              />

              <FlightInput
                flights={preferences.flights && preferences.flights.length > 0 
                  ? preferences.flights 
                  : [{ departureAirport: '', arrivalAirport: '', departureTime: null, returnTime: null }]}
                onChange={(flights) =>
                  setPreferences((p) => ({
                    ...p,
                    flights,
                  }))
                }
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-4 text-slate-700">
                  预算范围（¥）
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">最少</span>
                    <input
                      type="number"
                      min={0}
                      value={preferences.budget.min}
                      onChange={handleBudgetMinChange}
                      className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <span className="text-slate-400">-</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">最多</span>
                    <input
                      type="number"
                      min={0}
                      value={preferences.budget.max}
                      onChange={handleBudgetMaxChange}
                      className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  将会用于估算整体行程的消费水平。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">
                  兴趣标签（多选，可自定义）
                </label>
                <div className="flex flex-wrap gap-2">
                  {interestOptions.map((tag) => {
                    const isSelected = preferences.interests.includes(tag);
                    return (
                      <Tag
                        key={tag}
                        color={isSelected ? 'processing' : undefined}
                        closable
                        onClose={(e) => {
                          e.preventDefault();
                          handleInterestRemove(tag);
                        }}
                        className="cursor-pointer px-3 py-1 text-sm"
                        onClick={() => handleInterestToggle(tag)}
                      >
                        {tag}
                      </Tag>
                    );
                  })}
                  <Input
                    size="small"
                    placeholder="添加兴趣标签"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onPressEnter={handleAddInterest}
                    className="w-32 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">
                  美食偏好（多选，可自定义）
                </label>
                <div className="flex flex-wrap gap-2">
                  {foodOptions.map((tag) => {
                    const isSelected = preferences.foodPreferences.includes(tag);
                    return (
                      <Tag
                        key={tag}
                        color={isSelected ? 'magenta' : undefined}
                        closable
                        onClose={(e) => {
                          e.preventDefault();
                          handleFoodRemove(tag);
                        }}
                        className="cursor-pointer px-3 py-1 text-sm"
                        onClick={() => handleFoodToggle(tag)}
                      >
                        {tag}
                      </Tag>
                    );
                  })}
                  <Input
                    size="small"
                    placeholder="添加美食偏好"
                    value={newFood}
                    onChange={(e) => setNewFood(e.target.value)}
                    onPressEnter={handleAddFood}
                    className="w-32 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-700">
                  小红书笔记链接（可选）
                </label>
                <div className="space-y-2">
                  {(preferences.xiaohongshuNotes || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {preferences.xiaohongshuNotes.map((link, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200"
                        >
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate max-w-xs"
                          >
                            {link}
                          </a>
                          <button
                            onClick={() => handleRemoveNoteLink(link)}
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                            type="button"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入小红书笔记链接"
                      value={newNoteLink}
                      onChange={(e) => setNewNoteLink(e.target.value)}
                      onPressEnter={handleAddNoteLink}
                      className="flex-1"
                    />
                    <button
                      onClick={handleAddNoteLink}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                      type="button"
                    >
                      <Plus size={16} />
                      添加
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  可以添加多个小红书笔记链接，用于参考和规划行程。
                </p>
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
              {step === 2 ? '生成行程' : '下一步'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
