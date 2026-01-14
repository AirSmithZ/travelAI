// 旅行相关的纯函数工具，避免在组件/Context 中写复杂数据处理逻辑
// 符合「状态更新逻辑纯函数化」和「数据处理逻辑抽离」的规范

/**
 * 根据城市和天数生成初始行程数据
 * @param {Array<{ id: string, city: string }>} poiData
 * @param {string} city
 * @param {number} days
 * @returns {Record<string, Array<any>>}
 */
export function createInitialItinerary(poiData, city, days) {
  const cityPois = poiData.filter((poi) => poi.city === city);
  const newItinerary = {};

  for (let i = 1; i <= days; i += 1) {
    const startIdx = (i - 1) * 2;
    const dayPois = cityPois.slice(startIdx, startIdx + 2).map((poi) => ({
      ...poi,
      // 用于拖拽和 React 渲染的唯一 ID
      uniqueId: `${poi.id}-${Date.now()}-${Math.random()}`,
    }));
    newItinerary[`day${i}`] = dayPois;
  }

  return newItinerary;
}

/**
 * 向指定日期添加 POI
 * @param {Record<string, Array<any>>} itinerary
 * @param {string} dayKey
 * @param {any} poi
 * @returns {Record<string, Array<any>>}
 */
export function addPoiToDayInItinerary(itinerary, dayKey, poi) {
  const newPoi = { ...poi, uniqueId: `${poi.id}-${Date.now()}` };
  return {
    ...itinerary,
    [dayKey]: [...(itinerary[dayKey] || []), newPoi],
  };
}

/**
 * 从行程中移除指定 POI
 * @param {Record<string, Array<any>>} itinerary
 * @param {string} dayKey
 * @param {string} uniqueId
 * @returns {Record<string, Array<any>>}
 */
export function removePoiFromItinerary(itinerary, dayKey, uniqueId) {
  return {
    ...itinerary,
    [dayKey]: (itinerary[dayKey] || []).filter((item) => item.uniqueId !== uniqueId),
  };
}

/**
 * 更新某一天的排序
 * @param {Record<string, Array<any>>} itinerary
 * @param {string} dayKey
 * @param {Array<any>} newItems
 * @returns {Record<string, Array<any>>}
 */
export function updateItineraryOrderForDay(itinerary, dayKey, newItems) {
  return {
    ...itinerary,
    [dayKey]: newItems,
  };
}

