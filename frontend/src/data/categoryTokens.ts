import type { NodeCategory, TransportMode, WeatherIcon } from '../types/itinerary';

export const CATEGORY_META: Record<
  NodeCategory,
  { label: string; color: string; glow: string; icon: string }
> = {
  airport: { label: '机场', color: '#2d8f6f', glow: 'rgba(45,143,111,0.45)', icon: '✈' },
  hotel: { label: '酒店', color: '#6b7280', glow: 'rgba(107,114,128,0.35)', icon: '🛏' },
  restaurant: { label: '餐厅', color: '#b83240', glow: 'rgba(184,50,64,0.4)', icon: '🍽' },
  snack: { label: '小吃', color: '#d97706', glow: 'rgba(217,119,6,0.4)', icon: '🍜' },
  attraction: { label: '游玩', color: '#ca9a04', glow: 'rgba(202,154,4,0.4)', icon: '📷' },
  landmark: { label: '地标', color: '#6366d4', glow: 'rgba(99,102,212,0.4)', icon: '📍' },
  transit: { label: '交通', color: '#0891b2', glow: 'rgba(8,145,178,0.4)', icon: '↔' },
};

export const TRANSPORT_ICONS: Record<TransportMode, string> = {
  walk: '🚶',
  subway: '🚇',
  bus: '🚌',
  taxi: '🚕',
  flight: '✈',
  ferry: '⛴',
};

export const WEATHER_ICON_GLYPH: Record<WeatherIcon, string> = {
  sunny: '☀',
  cloudy: '☁',
  overcast: '🌥',
  rain: '🌧',
  storm: '⛈',
  snow: '❄',
};

export const WEATHER_ICON_OPTIONS: { value: WeatherIcon; label: string }[] = [
  { value: 'sunny', label: '晴' },
  { value: 'cloudy', label: '多云' },
  { value: 'overcast', label: '阴' },
  { value: 'rain', label: '雨' },
  { value: 'storm', label: '雷暴' },
  { value: 'snow', label: '雪' },
];
