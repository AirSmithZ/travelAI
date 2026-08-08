/**
 * 机场 IATA → 中文展示名；别名 → IATA（与 backend city_codes.json 对齐并扩展经停常见码）。
 * 展示 fallback：未知码原样大写。
 * 由 `npm run sync:airport-labels`（B-FLT-06）从 city_codes.json 同步生成；手写多机场优先名见脚本 HAND_LABELS。
 */

/** 机场三字码 → 中文（优先具体机场名，同城多机场区分） */
export const AIRPORT_LABELS: Record<string, string> = {
  BJS: "北京",
  BKK: "曼谷",
  CAN: "广州",
  CDG: "戴高乐",
  CKG: "重庆",
  CTU: "成都",
  DLC: "大连",
  DMK: "曼谷廊曼",
  DXB: "迪拜",
  EWR: "纽瓦克",
  FRA: "法兰克福",
  GMP: "金浦",
  HGH: "杭州",
  HKG: "香港",
  HKT: "普吉",
  HND: "羽田",
  ICN: "仁川",
  ITM: "伊丹",
  JFK: "肯尼迪",
  KIX: "关西",
  KUL: "吉隆坡",
  LGA: "纽约",
  LGW: "盖特威克",
  LHR: "希思罗",
  LON: "伦敦",
  MEL: "墨尔本",
  NKG: "南京",
  NRT: "成田",
  NYC: "纽约",
  ORY: "巴黎",
  OSA: "大阪",
  PAR: "巴黎",
  PEK: "首都",
  PKX: "大兴",
  PVG: "浦东",
  SEL: "首尔",
  SGN: "胡志明市",
  SHA: "虹桥",
  SIN: "新加坡",
  STN: "伦敦",
  SYD: "悉尼",
  SZX: "深圳",
  TAO: "青岛",
  TFU: "天府",
  TYO: "东京",
  WUH: "武汉",
  XIY: "西安",
  XMN: "厦门",
};

/** 用户输入别名 → IATA（小写 key） */
export const AIRPORT_ALIASES: Record<string, string> = {
  "巴黎": "CDG",
  "白云": "CAN",
  "北京": "PEK",
  "成都": "CTU",
  "成田": "NRT",
  "重庆": "CKG",
  "大阪": "KIX",
  "大连": "DLC",
  "大兴": "PKX",
  "迪拜": "DXB",
  "东京": "NRT",
  "法兰克福": "FRA",
  "关西": "KIX",
  "广州": "CAN",
  "杭州": "HGH",
  "虹桥": "SHA",
  "胡志明": "SGN",
  "吉隆坡": "KUL",
  "伦敦": "LHR",
  "曼谷": "BKK",
  "墨尔本": "MEL",
  "南京": "NKG",
  "纽约": "JFK",
  "浦东": "PVG",
  "普吉": "HKT",
  "普吉岛": "HKT",
  "青岛": "TAO",
  "仁川": "ICN",
  "厦门": "XMN",
  "上海": "PVG",
  "深圳": "SZX",
  "首都": "PEK",
  "首尔": "ICN",
  "双流": "CTU",
  "天府": "CTU",
  "武汉": "WUH",
  "西安": "XIY",
  "西贡": "SGN",
  "悉尼": "SYD",
  "香港": "HKG",
  "新加坡": "SIN",
  "羽田": "HND",
  "bjs": "BJS",
  "bkk": "BKK",
  "can": "CAN",
  "cdg": "CDG",
  "ckg": "CKG",
  "ctu": "CTU",
  "dlc": "DLC",
  "dxb": "DXB",
  "ewr": "EWR",
  "fra": "FRA",
  "gmp": "GMP",
  "hgh": "HGH",
  "hkg": "HKG",
  "hkt": "HKT",
  "hnd": "HND",
  "icn": "ICN",
  "itm": "ITM",
  "jfk": "JFK",
  "kix": "KIX",
  "kul": "KUL",
  "lga": "LGA",
  "lgw": "LGW",
  "lhr": "LHR",
  "lon": "LHR",
  "mel": "MEL",
  "nkg": "NKG",
  "nrt": "NRT",
  "nyc": "JFK",
  "ory": "ORY",
  "osa": "OSA",
  "par": "CDG",
  "pek": "PEK",
  "pkx": "PKX",
  "pvg": "PVG",
  "sel": "ICN",
  "sgn": "SGN",
  "sha": "SHA",
  "sin": "SIN",
  "stn": "STN",
  "syd": "SYD",
  "szx": "SZX",
  "tao": "TAO",
  "tyo": "NRT",
  "wuh": "WUH",
  "xiy": "XIY",
  "xmn": "XMN",
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
