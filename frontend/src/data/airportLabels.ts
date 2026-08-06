/**
 * 机场 IATA → 中文展示名；别名 → IATA（与 backend city_codes.json 对齐并扩展经停常见码）。
 * 展示 fallback：未知码原样大写。
 */

/** 机场三字码 → 中文（优先具体机场名，同城多机场区分） */
export const AIRPORT_LABELS: Record<string, string> = {
  // 中国
  PVG: '浦东',
  SHA: '虹桥',
  PEK: '首都',
  PKX: '大兴',
  CAN: '广州',
  SZX: '深圳',
  CTU: '成都',
  TFU: '天府',
  HGH: '杭州',
  XIY: '西安',
  CKG: '重庆',
  NKG: '南京',
  WUH: '武汉',
  XMN: '厦门',
  TAO: '青岛',
  DLC: '大连',
  HKG: '香港',
  // 东南亚
  SIN: '新加坡',
  KUL: '吉隆坡',
  BKK: '曼谷',
  DMK: '曼谷廊曼',
  SGN: '胡志明市',
  HAN: '河内',
  HKT: '普吉',
  MNL: '马尼拉',
  CGK: '雅加达',
  DPS: '巴厘岛',
  RGN: '仰光',
  // 东北亚
  NRT: '成田',
  HND: '羽田',
  KIX: '关西',
  ITM: '伊丹',
  ICN: '仁川',
  GMP: '金浦',
  TPE: '台北',
  TSA: '松山',
  // 南亚/中东
  DXB: '迪拜',
  DOH: '多哈',
  DEL: '德里',
  BOM: '孟买',
  // 欧美澳
  LHR: '希思罗',
  LGW: '盖特威克',
  CDG: '戴高乐',
  FRA: '法兰克福',
  JFK: '肯尼迪',
  EWR: '纽瓦克',
  LAX: '洛杉矶',
  SFO: '旧金山',
  SYD: '悉尼',
  MEL: '墨尔本',
};

/** 用户输入别名 → IATA（小写 key） */
export const AIRPORT_ALIASES: Record<string, string> = {
  // 中文城市/机场
  上海: 'PVG',
  浦东: 'PVG',
  虹桥: 'SHA',
  北京: 'PEK',
  首都: 'PEK',
  大兴: 'PKX',
  广州: 'CAN',
  深圳: 'SZX',
  成都: 'CTU',
  天府: 'TFU',
  杭州: 'HGH',
  西安: 'XIY',
  重庆: 'CKG',
  南京: 'NKG',
  武汉: 'WUH',
  厦门: 'XMN',
  青岛: 'TAO',
  大连: 'DLC',
  香港: 'HKG',
  新加坡: 'SIN',
  吉隆坡: 'KUL',
  曼谷: 'BKK',
  胡志明: 'SGN',
  胡志明市: 'SGN',
  西贡: 'SGN',
  河内: 'HAN',
  普吉: 'HKT',
  普吉岛: 'HKT',
  东京: 'NRT',
  成田: 'NRT',
  羽田: 'HND',
  大阪: 'KIX',
  关西: 'KIX',
  首尔: 'ICN',
  仁川: 'ICN',
  台北: 'TPE',
  迪拜: 'DXB',
  伦敦: 'LHR',
  巴黎: 'CDG',
  法兰克福: 'FRA',
  纽约: 'JFK',
  悉尼: 'SYD',
  墨尔本: 'MEL',
  // IATA 自身
  sha: 'SHA',
  pvg: 'PVG',
  pek: 'PEK',
  pkx: 'PKX',
  sin: 'SIN',
  hkg: 'HKG',
  nrt: 'NRT',
  hnd: 'HND',
  icn: 'ICN',
  bkk: 'BKK',
  kul: 'KUL',
  sgn: 'SGN',
  han: 'HAN',
  hkt: 'HKT',
  tpe: 'TPE',
  dxb: 'DXB',
  lhr: 'LHR',
  cdg: 'CDG',
  fra: 'FRA',
  jfk: 'JFK',
  syd: 'SYD',
  mel: 'MEL',
  kix: 'KIX',
  can: 'CAN',
  szx: 'SZX',
  ctu: 'CTU',
  tyo: 'NRT',
  sel: 'ICN',
  lon: 'LHR',
  par: 'CDG',
  nyc: 'JFK',
};

export function resolveAirportCode(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const alias = AIRPORT_ALIASES[raw] ?? AIRPORT_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (/^[a-zA-Z]{3}$/.test(raw)) return raw.toUpperCase();
  return raw.toUpperCase();
}

export function formatAirportLabel(code: string): string {
  const key = (code || '').trim().toUpperCase();
  if (!key) return '—';
  return AIRPORT_LABELS[key] ?? key;
}

export function formatRouteLabel(route: string): string {
  if (!route?.trim()) return '—';
  return route
    .split('→')
    .map((seg) => formatAirportLabel(seg.trim()))
    .join('→');
}

export function formatEndpointPair(origin: string, dest: string): string {
  return `${formatAirportLabel(origin)}→${formatAirportLabel(dest)}`;
}
