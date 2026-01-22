import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Button from '../ui/Button';
import { WORLD_CITY_DATA } from '../../constants/worldCities';

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

const CitySelect = ({ value, onChange, excludeCities = [] }) => {
  const selectedCity = value ? (typeof value === 'string' ? { name: value } : value) : null;
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const hasKeyword = input.trim().length > 0;
  const excludeList = excludeCities.map(c => typeof c === 'string' ? { name: c } : c);
  if (selectedCity) {
    excludeList.push(selectedCity);
  }
  const options = useMemo(() => filterCities(input, excludeList), [input, excludeList]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (city) => {
    setInput('');
    setIsOpen(false);
    if (onChange) {
      onChange(city);
    }
  };

  const handleRemove = () => {
    if (onChange) {
      onChange(null);
    }
  };

  return (
    <div className="relative">
      {selectedCity && (
        <div className="mb-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/15 text-sky-200 rounded-xl border border-sky-400/40 inline-flex">
            <span className="text-sm font-medium">{selectedCity.name || selectedCity}</span>
            <button
              onClick={handleRemove}
              className="text-sky-200 hover:text-sky-100 transition-colors"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 200);
        }}
        placeholder="输入城市名称，如 北京 / Paris / New York..."
        className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
      />
      {isOpen && (hasKeyword || options.length > 0) && (
        <div className="absolute mt-2 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-900/95 backdrop-blur shadow-2xl z-10">
          {options.map((city) => {
            return (
              <button
                key={city.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(city);
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-slate-800/60 text-slate-100"
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
  );
};

const AddressInput = ({ addresses, onChange }) => {
  const handleAddAddress = () => {
    onChange([...addresses, { 
      city: null, 
      address: '',
      checkInDate: null,
      checkOutDate: null
    }]);
  };

  const handleRemoveAddress = (index) => {
    // 至少保留一个地址
    if (addresses.length > 1) {
      onChange(addresses.filter((_, i) => i !== index));
    }
  };

  const handleAddressChange = (index, field, value) => {
    const updated = addresses.map((addr, i) => {
      if (i === index) {
        return { ...addr, [field]: value };
      }
      return addr;
    });
    onChange(updated);
  };

  // 获取所有已选择的城市（用于排除）
  const getAllSelectedCities = () => {
    return addresses
      .map(addr => addr.city)
      .filter(city => city !== null && city !== '');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-200/90">
          🏠 居住地址（多地）
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddAddress}
          className="flex items-center gap-1"
        >
          <Plus size={14} />
          添加地址
        </Button>
      </div>
      
      {addresses.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-700/70 rounded-xl bg-slate-950/20">
          请添加至少一个居住地址
        </div>
      )}

      {addresses.map((address, index) => {
        // 获取除了当前地址之外的其他已选城市
        const otherSelectedCities = addresses
          .filter((_, i) => i !== index)
          .map(addr => addr.city)
          .filter(city => city !== null && city !== '');
        
        return (
          <div
            key={index}
            className="p-4 border border-slate-700/70 rounded-2xl bg-slate-950/20 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-100">
                地址 {index + 1}
              </h4>
              <button
                type="button"
                onClick={() => handleRemoveAddress(index)}
                disabled={addresses.length === 1}
                className={`p-1.5 transition-colors ${
                  addresses.length === 1
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-400 hover:text-red-500'
                }`}
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  城市
                </label>
                <CitySelect
                  value={address.city}
                  onChange={(city) =>
                    handleAddressChange(index, 'city', city)
                  }
                  excludeCities={otherSelectedCities}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  详细地址
                </label>
                <input
                  type="text"
                  value={address.address || ''}
                  onChange={(e) =>
                    handleAddressChange(index, 'address', e.target.value)
                  }
                  placeholder="如：朝阳区xxx街道xxx号"
                  className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    入住日期
                  </label>
                  <input
                    type="date"
                    value={address.checkInDate || ''}
                    onChange={(e) =>
                      handleAddressChange(index, 'checkInDate', e.target.value || null)
                    }
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    退房日期
                  </label>
                  <input
                    type="date"
                    value={address.checkOutDate || ''}
                    onChange={(e) =>
                      handleAddressChange(index, 'checkOutDate', e.target.value || null)
                    }
                    min={address.checkInDate || ''}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AddressInput;
