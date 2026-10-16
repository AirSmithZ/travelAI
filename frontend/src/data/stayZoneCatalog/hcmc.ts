/**
 * HOT-ZONE-CATALOG D · 胡志明市封闭片区池（真实商圈坐标，非 mock 库存）。
 * 坐标为公开商圈/地标附近中心点，供搜店围栏；可订性仍以 RollingGo/Trip 为准。
 */

export type StayZoneCatalogEntry = {
  id: string;
  city: string;
  label: string;
  label_en?: string;
  lat: number;
  lng: number;
  radius_m: number;
  search_query: string;
  /** Light theme hints for client-side rank */
  themes?: string[];
  transit_note?: string;
};

/** catalog id prefix — stable across sessions */
export const HCMC_CATALOG_CITY_KEYS = ['胡志明', '胡志明市', '西贡', 'ho chi minh', 'saigon', 'sgn'];

export const HCMC_STAY_ZONE_CATALOG: StayZoneCatalogEntry[] = [
  {
    id: 'catalog:hcmc:d1',
    city: '胡志明市',
    label: '第一郡 · 滨城',
    label_en: 'District 1 · Ben Thanh',
    lat: 10.7725,
    lng: 106.698,
    radius_m: 1400,
    search_query: 'Ben Thanh Market Ho Chi Minh City',
    themes: ['food', 'transit', 'nightlife'],
    transit_note: '地铁/公交枢纽；步行可达歌剧院一带',
  },
  {
    id: 'catalog:hcmc:d3',
    city: '胡志明市',
    label: '第三郡',
    label_en: 'District 3',
    lat: 10.784,
    lng: 106.693,
    radius_m: 1300,
    search_query: 'District 3 Ho Chi Minh City hotels',
    themes: ['food', 'quiet'],
    transit_note: '相对第一郡安静，餐饮密集',
  },
  {
    id: 'catalog:hcmc:bui-vien',
    city: '胡志明市',
    label: '范五老 / 背包客街',
    label_en: 'Bui Vien',
    lat: 10.7668,
    lng: 106.6917,
    radius_m: 900,
    search_query: 'Bui Vien Street Ho Chi Minh City',
    themes: ['nightlife', 'budget'],
    transit_note: '夜生活集中；噪音敏感者慎选',
  },
  {
    id: 'catalog:hcmc:thao-dien',
    city: '胡志明市',
    label: '草甸 · 安富',
    label_en: 'Thao Dien',
    lat: 10.802,
    lng: 106.732,
    radius_m: 1500,
    search_query: 'Thao Dien Ho Chi Minh City',
    themes: ['family', 'quiet', 'food'],
    transit_note: '外侨区；去市中心需过桥/打车',
  },
  {
    id: 'catalog:hcmc:phu-my-hung',
    city: '胡志明市',
    label: '富美兴 · 第七郡',
    label_en: 'Phu My Hung D7',
    lat: 10.729,
    lng: 106.721,
    radius_m: 1600,
    search_query: 'Phu My Hung District 7 Ho Chi Minh',
    themes: ['family', 'quiet'],
    transit_note: '新区规划好；距中心较远',
  },
  {
    id: 'catalog:hcmc:cho-lon',
    city: '胡志明市',
    label: '堤岸 · 第五郡',
    label_en: 'Cholon D5',
    lat: 10.752,
    lng: 106.663,
    radius_m: 1400,
    search_query: 'Cholon District 5 Ho Chi Minh City',
    themes: ['food', 'culture'],
    transit_note: '华人商圈；美食密集',
  },
  {
    id: 'catalog:hcmc:tan-binh',
    city: '胡志明市',
    label: '新山一机场带 · 新平',
    label_en: 'Tan Binh · Airport',
    lat: 10.801,
    lng: 106.655,
    radius_m: 1800,
    search_query: 'Tan Son Nhat Airport hotels Ho Chi Minh',
    themes: ['transit'],
    transit_note: '早飞/晚到友好；非观光核心',
  },
  {
    id: 'catalog:hcmc:nguyen-hue',
    city: '胡志明市',
    label: '阮惠步行街一带',
    label_en: 'Nguyen Hue Walking Street',
    lat: 10.7743,
    lng: 106.7038,
    radius_m: 1000,
    search_query: 'Nguyen Hue Boulevard Ho Chi Minh City',
    themes: ['food', 'transit', 'nightlife'],
    transit_note: '市中心地标轴；偏游客区',
  },
];
