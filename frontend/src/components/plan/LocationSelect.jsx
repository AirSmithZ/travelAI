import React, { useMemo, useState } from 'react';
import { WORLD_CITY_DATA } from '../../constants/worldCities';
import { X } from 'lucide-react';

const normalize = (value) => (value || '').toLowerCase();

const filterCities = (keyword, excludeCities = []) => {
  const query = normalize(keyword);
  const excludeNames = excludeCities.map(c => normalize(c.name || c));

  return WORLD_CITY_DATA.filter((city) => {
    // 排除已选择的城市
    if (excludeNames.includes(normalize(city.name))) {
      return false;
    }
    
    if (!query) return true;

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
  // 支持 value 为字符串、数组或对象
  const getSelectedCities = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map(v => typeof v === 'string' ? { name: v } : v);
    }
    if (typeof val === 'string') {
      return [{ name: val }];
    }
    if (val?.name) {
      return [val];
    }
    return [];
  };

  const selectedCities = getSelectedCities(value);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const hasKeyword = input.trim().length > 0;
  const options = useMemo(() => filterCities(input, selectedCities), [input, selectedCities]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (city) => {
    setInput('');
    setIsOpen(false);
    if (onChange) {
      const newCities = [...selectedCities, city];
      onChange(newCities);
    }
  };

  const handleRemove = (cityToRemove) => {
    if (onChange) {
      const newCities = selectedCities.filter(
        c => (c.name || c) !== (cityToRemove.name || cityToRemove)
      );
      onChange(newCities);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium mb-1 text-slate-700">
        目的地（可多选）
      </label>
      
      {/* 已选城市标签 */}
      {selectedCities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedCities.map((city, index) => {
            const cityName = city.name || city;
            return (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20"
              >
                <span className="text-sm font-medium">{cityName}</span>
                <button
                  onClick={() => handleRemove(city)}
                  className="text-primary hover:text-primary/70 transition-colors"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // 延迟关闭，以便点击选项时不会先触发 blur
            setTimeout(() => setIsOpen(false), 200);
          }}
          placeholder="输入城市名称，如 东京 / Paris / New York..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {isOpen && (hasKeyword || options.length > 0) && (
          <div className="absolute mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg z-10">
            {options.map((city) => {
              return (
                <button
                  key={city.id}
                  type="button"
                  // 使用 onMouseDown 避免输入框先触发 blur，导致点击失效
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(city);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-slate-50 text-slate-700"
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
            {options.length === 0 && hasKeyword && (
              <div className="px-3 py-2 text-xs text-slate-400">
                未找到匹配城市，请尝试输入其他关键词。
              </div>
            )}
            {options.length === 0 && !hasKeyword && (
              <div className="px-3 py-2 text-xs text-slate-400">
                输入城市名称开始搜索
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationSelect;

