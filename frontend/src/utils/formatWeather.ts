import { WEATHER_ICON_GLYPH, WEATHER_ICON_OPTIONS } from '../data/categoryTokens';
import type { DayWeather, WeatherIcon } from '../types/itinerary';

export function weatherIconGlyph(icon?: WeatherIcon | string): string {
  if (icon && icon in WEATHER_ICON_GLYPH) {
    return WEATHER_ICON_GLYPH[icon as WeatherIcon];
  }
  return '☁';
}

/** 天气 icon → 中文标签（晴 / 多云 / …） */
export function weatherIconLabel(icon?: WeatherIcon | string): string {
  const found = WEATHER_ICON_OPTIONS.find((opt) => opt.value === icon);
  return found?.label ?? '多云';
}

export function formatWeatherTemp(weather: DayWeather): string {
  return `${weather.temp_min}~${weather.temp_max}°C`;
}

export function formatWeatherBrief(weather: DayWeather): string {
  return `${weatherIconGlyph(weather.icon)} ${formatWeatherTemp(weather)}`;
}

/** 副行文案：由 icon 映射，不读手写 description */
export function formatWeatherSubline(weather: DayWeather): string {
  return weatherIconLabel(weather.icon);
}
