import React from 'react';
import { Plus, X } from 'lucide-react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import Button from '../ui/Button';

const FlightInput = ({ flights, onChange }) => {
  const handleAddFlight = () => {
    onChange([...flights, { 
      departureAirport: '', 
      arrivalAirport: '',
      departureTime: null,
      returnTime: null
    }]);
  };

  const handleRemoveFlight = (index) => {
    // 至少保留一个航班
    if (flights.length > 1) {
      onChange(flights.filter((_, i) => i !== index));
    }
  };

  const handleFlightChange = (index, field, value) => {
    const updated = flights.map((flight, i) => {
      if (i === index) {
        return { ...flight, [field]: value };
      }
      return flight;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-200/90">
          ✈️ 航班信息（多程）
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddFlight}
          className="flex items-center gap-1"
        >
          <Plus size={14} />
          添加航班
        </Button>
      </div>
      
      {flights.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-700/70 rounded-xl bg-slate-950/20">
          请添加至少一个航班信息
        </div>
      )}

      {flights.map((flight, index) => (
        <div
          key={index}
          className="p-4 border border-slate-700/70 rounded-2xl bg-slate-950/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-100">
              航班 {index + 1}
            </h4>
            <button
              type="button"
              onClick={() => handleRemoveFlight(index)}
              disabled={flights.length === 1}
              className={`p-1.5 transition-colors ${
                flights.length === 1
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-400 hover:text-red-500'
              }`}
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                起飞机场
              </label>
              <input
                type="text"
                value={flight.departureAirport || ''}
                onChange={(e) =>
                  handleFlightChange(index, 'departureAirport', e.target.value)
                }
                placeholder="如：PEK"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                落地机场
              </label>
              <input
                type="text"
                value={flight.arrivalAirport || ''}
                onChange={(e) =>
                  handleFlightChange(index, 'arrivalAirport', e.target.value)
                }
                placeholder="如：NRT"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                出发时间
              </label>
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                value={flight.departureTime ? dayjs(flight.departureTime) : null}
                onChange={(date) =>
                  handleFlightChange(index, 'departureTime', date ? date.toDate() : null)
                }
                placeholder="选择出发时间"
                className="w-full"
                allowClear
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                返回时间
              </label>
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                value={flight.returnTime ? dayjs(flight.returnTime) : null}
                onChange={(date) =>
                  handleFlightChange(index, 'returnTime', date ? date.toDate() : null)
                }
                placeholder="选择返回时间"
                className="w-full"
                disabledDate={(current) => {
                  if (!flight.departureTime) return false;
                  return current && current.isBefore(dayjs(flight.departureTime), 'day');
                }}
                allowClear
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FlightInput;
