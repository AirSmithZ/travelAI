export const INTEREST_TAGS = [
  "自然风光", "人文历史", "美食", "亲子", "摄影", "夜生活",
  "极限运动", "购物", "博物馆", "温泉", "建筑", "宗教"
];

export const CUISINES = [
  "中餐", "日料", "韩餐", "意大利菜", "法餐", "西班牙菜", 
  "墨西哥菜", "泰国菜", "印度菜", "越南菜", "素食", "海鲜", "烧烤", "火锅", "甜品"
];

export const CITIES = {
  "东京": { lat: 35.6762, lng: 139.6503 },
  "巴黎": { lat: 48.8566, lng: 2.3522 },
  "曼谷": { lat: 13.7563, lng: 100.5018 },
  "罗马": { lat: 41.9028, lng: 12.4964 },
  "纽约": { lat: 40.7128, lng: -74.0060 },
  "悉尼": { lat: -33.8688, lng: 151.2093 },
  "巴塞罗那": { lat: 41.3851, lng: 2.1734 }
};

export const POI_DATA = [
  { id: 't1', city: '东京', name: '浅草寺', category: '人文历史', lat: 35.7148, lng: 139.7967, duration: 90, rating: 4.5, imageKeyword: 'Sensoji Temple' },
  { id: 't2', city: '东京', name: '涩谷十字路口', category: '摄影', lat: 35.6595, lng: 139.7006, duration: 30, rating: 4.4, imageKeyword: 'Shibuya Crossing' },
  { id: 't3', city: '东京', name: '筑地市场', category: '美食', lat: 35.6654, lng: 139.7707, duration: 120, rating: 4.5, imageKeyword: 'Tsukiji Market' },
  { id: 't4', city: '东京', name: '新宿御苑', category: '自然风光', lat: 35.6852, lng: 139.7102, duration: 120, rating: 4.6, imageKeyword: 'Shinjuku Gyoen' },
  { id: 't5', city: '东京', name: '东京塔', category: '建筑', lat: 35.6586, lng: 139.7454, duration: 90, rating: 4.5, imageKeyword: 'Tokyo Tower' },
  { id: 'p1', city: '巴黎', name: '埃菲尔铁塔', category: '建筑', lat: 48.8584, lng: 2.2945, duration: 120, rating: 4.6, imageKeyword: 'Eiffel Tower' },
  { id: 'p2', city: '巴黎', name: '卢浮宫', category: '博物馆', lat: 48.8606, lng: 2.3376, duration: 240, rating: 4.7, imageKeyword: 'Louvre Museum' },
  { id: 'p3', city: '巴黎', name: '塞纳河游船', category: '自然风光', lat: 48.8566, lng: 2.3522, duration: 90, rating: 4.5, imageKeyword: 'Seine River Cruise' },
  { id: 'b1', city: '曼谷', name: '大皇宫', category: '人文历史', lat: 13.7500, lng: 100.4933, duration: 120, rating: 4.4, imageKeyword: 'Grand Palace Bangkok' },
  { id: 'b2', city: '曼谷', name: '卧佛寺', category: '宗教', lat: 13.7465, lng: 100.4933, duration: 60, rating: 4.5, imageKeyword: 'Wat Pho' },
  { id: 'ny1', city: '纽约', name: '自由女神像', category: '人文历史', lat: 40.6892, lng: -74.0445, duration: 180, rating: 4.6, imageKeyword: 'Statue of Liberty' },
  { id: 'ny2', city: '纽约', name: '时代广场', category: '摄影', lat: 40.7580, lng: -73.9855, duration: 60, rating: 4.5, imageKeyword: 'Times Square' }
];

export const RESTAURANT_DATA = [
  { id: 'r1', city: '东京', name: '寿司大', cuisine: '日料', lat: 35.6550, lng: 139.7901, price: 500, rating: 4.6, imageKeyword: 'Sushi' },
  { id: 'r2', city: '东京', name: '一兰拉面', cuisine: '中餐', lat: 35.6591, lng: 139.7000, price: 80, rating: 4.4, imageKeyword: 'Ramen' },
  { id: 'r3', city: '巴黎', name: 'Le Jules Verne', cuisine: '法餐', lat: 48.8584, lng: 2.2945, price: 2500, rating: 4.5, imageKeyword: 'French Fine Dining' },
  { id: 'r4', city: '曼谷', name: 'Gaggan Anand', cuisine: '印度', lat: 13.7319, lng: 100.5434, price: 1800, rating: 4.7, imageKeyword: 'Indian Food Fine Dining' },
  { id: 'r5', city: '纽约', name: 'Joe’s Pizza', cuisine: '披萨', lat: 40.7308, lng: -74.0056, price: 60, rating: 4.4, imageKeyword: 'Pizza Slice' }
];
