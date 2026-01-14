import React, { useMemo, useState, useEffect } from 'react';
import { WORLD_CITY_DATA } from '../../constants/worldCities';

const normalize = (value) => (value || '').toLowerCase();

const filterCities = (keyword) => {
  const query = normalize(keyword);
  if (!query) return WORLD_CITY_DATA;

  return WORLD_CITY_DATA.filter((city) => {
    const name = normalize(city.name);
    const en = normalize(city.englishName);
    const country = normalize(city.country);
    const code = normalize(city.countryCode);
    return (
      name.includes(query) ||
      en.includes(query) ||
      country.includes(query) ||
      code.includes(query)
    );
  })
};

const LocationSelect = ({ value, onChange }) => {
  // 支持 value 为字符串（城市名称）或对象（城市对象）
  const getCityName = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val?.name) return val.name;
    return '';
  };

  const [input, setInput] = useState(getCityName(value));
  const [isOpen, setIsOpen] = useState(false);

  // 同步 value prop 的变化到输入框
  useEffect(() => {
    const cityName = getCityName(value);
    if (cityName) {
      setInput(cityName);
      setIsOpen(false);
    } else {
      setInput('');
      setIsOpen(false);
    }
  }, [value]);

  const hasKeyword = input.trim().length > 0;
  const hasValue = Boolean(value);

  const options = useMemo(() => (hasKeyword || hasValue ? filterCities(input) : []), [input, hasKeyword, hasValue]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (city) => {
    setInput(city.name);
    setIsOpen(false);
    if (onChange) {
      onChange(city);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium mb-1 text-slate-700">
        目的地
      </label>
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          placeholder="输入城市名称，如 东京 / Paris / New York..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {isOpen && (hasKeyword || hasValue) && (
          <div className="absolute mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg z-10">
            {options.map((city) => {
              const isActive = city.name === getCityName(value);
              return (
                <button
                  key={city.id}
                  type="button"
                  // 使用 onMouseDown 避免输入框先触发 blur，导致点击失效
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(city);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-medium truncate">
                      {city.name}
                      <span className="ml-2 text-xs text-slate-400">
                        {city.englishName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {city.country} · {city.region}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {city.countryCode}
                  </span>
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">
                未找到匹配城市，请尝试输入其他关键词。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationSelect;

