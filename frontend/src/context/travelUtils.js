// 旅行相关的纯函数工具，避免在组件/Context 中写复杂数据处理逻辑
// 符合「状态更新逻辑纯函数化」和「数据处理逻辑抽离」的规范

/**
 * 根据城市和天数生成初始行程数据
 * @param {Array<{ id: string, city: string }>} poiData
 * @param {string} city
 * @param {number} days
 * @returns {Record<string, { morning: Array<any>, afternoon: Array<any>, evening: Array<any> }>}
 */
export function createInitialItinerary(poiData, city, days) {
  const cityPois = poiData.filter((poi) => poi.city === city);
  const newItinerary = {};

  for (let i = 1; i <= days; i += 1) {
    const startIdx = (i - 1) * 3;
    const dayPois = cityPois.slice(startIdx, startIdx + 3).map((poi) => ({
      ...poi,
      // 用于拖拽和 React 渲染的唯一 ID
      uniqueId: `${poi.id}-${Date.now()}-${Math.random()}`,
      // 默认分配到上午，保持兼容（后续用户可拖拽调整到中/晚）
      timeOfDay: 'morning',
    }));
    newItinerary[`day${i}`] = {
      morning: dayPois.slice(0, 1),
      afternoon: dayPois.slice(1, 2),
      evening: dayPois.slice(2),
    };
  }

  return newItinerary;
}

/**
 * 向指定日期添加 POI
 * @param {Record<string, any>} itinerary
 * @param {string} dayKey
 * @param {any} poi
 * @param {'morning'|'afternoon'|'evening'} [timeOfDay]
 * @returns {Record<string, any>}
 */
export function addPoiToDayInItinerary(itinerary, dayKey, poi, timeOfDay = 'afternoon') {
  const segment = timeOfDay || 'afternoon';
  const newPoi = { ...poi, uniqueId: `${poi.id}-${Date.now()}`, timeOfDay: segment };
  const day = itinerary?.[dayKey];
  const nextDay = day && typeof day === 'object' && !Array.isArray(day)
    ? day
    : { morning: Array.isArray(day) ? day : [], afternoon: [], evening: [] };
  return {
    ...itinerary,
    [dayKey]: {
      morning: Array.isArray(nextDay.morning) ? nextDay.morning : [],
      afternoon: Array.isArray(nextDay.afternoon) ? nextDay.afternoon : [],
      evening: Array.isArray(nextDay.evening) ? nextDay.evening : [],
      [segment]: [...(Array.isArray(nextDay[segment]) ? nextDay[segment] : []), newPoi],
    },
  };
}

/**
 * 从行程中移除指定 POI
 * @param {Record<string, any>} itinerary
 * @param {string} dayKey
 * @param {string} uniqueId
 * @param {'morning'|'afternoon'|'evening'} [timeOfDay]
 * @returns {Record<string, any>}
 */
export function removePoiFromItinerary(itinerary, dayKey, uniqueId, timeOfDay) {
  const day = itinerary?.[dayKey];
  // 兼容旧结构（数组）
  if (Array.isArray(day)) {
    return {
      ...itinerary,
      [dayKey]: day.filter((item) => item.uniqueId !== uniqueId),
    };
  }

  const nextDay = day && typeof day === 'object'
    ? day
    : { morning: [], afternoon: [], evening: [] };

  const segments = ['morning', 'afternoon', 'evening'];
  const segsToUpdate = timeOfDay && segments.includes(timeOfDay) ? [timeOfDay] : segments;

  const updated = { ...nextDay };
  segsToUpdate.forEach((seg) => {
    const list = Array.isArray(nextDay[seg]) ? nextDay[seg] : [];
    updated[seg] = list.filter((item) => item.uniqueId !== uniqueId);
  });

  return {
    ...itinerary,
    [dayKey]: {
      morning: Array.isArray(updated.morning) ? updated.morning : [],
      afternoon: Array.isArray(updated.afternoon) ? updated.afternoon : [],
      evening: Array.isArray(updated.evening) ? updated.evening : [],
    },
  };
}

/**
 * 更新某一天的排序
 * @param {Record<string, any>} itinerary
 * @param {string} dayKey
 * @param {Array<any>} newItems
 * @param {'morning'|'afternoon'|'evening'} [timeOfDay]
 * @returns {Record<string, any>}
 */
export function updateItineraryOrderForDay(itinerary, dayKey, newItems, timeOfDay) {
  const day = itinerary?.[dayKey];
  // 兼容旧结构（数组）
  if (Array.isArray(day)) {
    return {
      ...itinerary,
      [dayKey]: newItems,
    };
  }
  const nextDay = day && typeof day === 'object'
    ? day
    : { morning: [], afternoon: [], evening: [] };
  const seg = timeOfDay || 'afternoon';
  return {
    ...itinerary,
    [dayKey]: {
      morning: Array.isArray(nextDay.morning) ? nextDay.morning : [],
      afternoon: Array.isArray(nextDay.afternoon) ? nextDay.afternoon : [],
      evening: Array.isArray(nextDay.evening) ? nextDay.evening : [],
      [seg]: Array.isArray(newItems) ? newItems.map((x) => ({ ...x, timeOfDay: seg })) : [],
    },
  };
}

