/**
 * 把 out/澳新行程整理.md 的节点表收成现有 Itinerary。
 * 坐标、通勤、开销沿用文档，不重新地理编码。
 * 运行：node scripts/build-anz-itinerary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.resolve(here, '../../../out/澳新行程整理.md');
const outPath = path.resolve(here, '../src/data/anzTrip.json');

const WEEKDAY = {
  一: '周一',
  二: '周二',
  三: '周三',
  四: '周四',
  五: '周五',
  六: '周六',
  日: '周日',
};

const REGION_BY_DATE = {
  '2027-02-09': '成都',
  '2027-02-10': '墨尔本',
  '2027-02-11': '墨尔本',
  '2027-02-12': '霍巴特',
  '2027-02-13': '霍巴特',
  '2027-02-14': '霍巴特',
  '2027-02-15': '悉尼',
  '2027-02-16': '悉尼',
  '2027-02-17': '凯恩斯',
  '2027-02-18': '凯恩斯',
  '2027-02-19': '凯恩斯',
  '2027-02-20': '凯恩斯',
  '2027-02-21': '基督城',
  '2027-02-22': '基督城',
  '2027-02-23': '费尔利',
  '2027-02-24': '费尔利',
  '2027-02-25': '瓦纳卡',
  '2027-02-26': '皇后镇',
  '2027-02-27': '皇后镇',
  '2027-02-28': '皇后镇',
  '2027-03-01': '皇后镇',
};

const HOTEL_URL = {
  'Absolute Collins Apartments':
    'https://www.booking.com/hotel/au/centre-collins.zh-cn.html?checkin=2027-02-10&checkout=2027-02-12&group_adults=4&no_rooms=2&selected_currency=CNY',
  'Hobart Waterfront Apartments':
    'https://www.booking.com/hotel/au/hobart-waterfront-apartments.zh-cn.html?checkin=2027-02-12&checkout=2027-02-15&group_adults=4&no_rooms=2&selected_currency=CNY',
  'Luxury Stay in Sydney CBD':
    'https://www.booking.com/hotel/au/luxury-stay-in-sydney-cbd-sydney.zh-cn.html?checkin=2027-02-15&checkout=2027-02-17&group_adults=4&no_rooms=2&selected_currency=CNY',
  'Aveline Dual-Key':
    'https://www.booking.com/hotel/au/aveline-dual-key-at-mantra-trilogy-cairns-city.zh-cn.html?checkin=2027-02-17&checkout=2027-02-21&group_adults=4&no_rooms=2&selected_currency=CNY',
};

function isoDate(month, day) {
  return `2027-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMdDate(text) {
  const m = String(text).match(/(\d+)\s*月\s*(\d+)\s*日/);
  return m ? isoDate(m[1], m[2]) : null;
}

function padTime(h, min) {
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parseClock(cell) {
  const range = cell.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (range) {
    return {
      start_time: padTime(range[1], range[2]),
      end_time: padTime(range[3], range[4]),
    };
  }
  const one = cell.match(/(\d{1,2}):(\d{2})/);
  if (!one) return {};
  return { start_time: padTime(one[1], one[2]) };
}

function parseCoords(cell) {
  const out = [];
  const re = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/g;
  let m;
  while ((m = re.exec(cell))) {
    out.push({ lat: Number(m[1]), lng: Number(m[2]) });
  }
  return out;
}

function parseDuration(text) {
  if (!text) return 0;
  const total = text.match(/合计\s*(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分)?/);
  const source = total ? `合计 ${total[1]} 小时 ${total[2] ?? ''} 分` : text;
  const hm = source.match(/(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分)?/);
  if (hm) {
    return Math.round(Number(hm[1]) * 60) + (hm[2] ? Number(hm[2]) : 0);
  }
  const only = text.match(/(\d+)\s*分/);
  return only ? Number(only[1]) : 0;
}

function parseDistance(text) {
  if (!text) return undefined;
  const straight = text.match(/直线\s*(\d+(?:\.\d+)?)\s*公里/);
  const km = straight || text.match(/(\d+(?:\.\d+)?)\s*公里/);
  if (!km) return undefined;
  return Math.round(Number(km[1]) * 1000);
}

function transportMode(text) {
  if (!text) return 'walk';
  if (/飞机/.test(text) && !/或飞回/.test(text)) return 'flight';
  if (/船/.test(text)) return 'ferry';
  if (/火车/.test(text)) return 'subway';
  if (/SkyBus|公交|巴士|Metro|团车|接驳/.test(text)) return 'bus';
  if (/开车|自驾|出租车/.test(text)) return 'taxi';
  if (/步行/.test(text)) return 'walk';
  if (/飞机/.test(text)) return 'flight';
  return 'walk';
}

function categoryOf(name) {
  if (/Apex|公交总站/.test(name)) return 'transit';
  if (/机场|双流|^成都$/.test(name)) return 'airport';
  if (/奥兰季|Apartments|Stay|Lylo|Aveline|Pinewood|Alpine Junction|住处|公寓/.test(name)) return 'hotel';
  if (/回到酒店|回到公寓|回到松木|回到奥兰季|回到 Lylo|回到 Alpine|酒店出发/.test(name)) return 'hotel';
  if (/Palermo|Max|Bar Totti|Porteno|Creamery|早茶|午餐|Salmon|啤酒/.test(name)) return 'restaurant';
  if (/Southern Cross|环形码头|Brooke|Reef Fleet|Franklin|回到码头/.test(name)) {
    return 'transit';
  }
  if (/教堂|歌剧院|拱廊|图书馆|火车站/.test(name)) return 'landmark';
  if (/游船|巡航/.test(name)) return 'transit';
  return 'attraction';
}

function costLabel(cell) {
  const text = cell.trim();
  if (!text) return undefined;
  if (text === '0') return '不另收费';
  return text;
}

function splitRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** 表后的加油站是参考点，不进当天停留链。 */
function parseFuelRows(block) {
  const rows = [];
  let active = false;
  for (const line of block.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/---/.test(line) && !/\d/.test(line)) continue;
    const cells = splitRow(line);
    const header =
      cells.length >= 3 &&
      cells.length <= 4 &&
      cells[0] === '名称' &&
      cells[1] === '坐标' &&
      cells[2] === '直线';
    if (header) {
      active = true;
      continue;
    }
    if (!active || !cells[0]) continue;
    const coords = parseCoords(cells[1] ?? '');
    if (coords.length !== 1) throw new Error(`加油站坐标不对：${cells[0]}`);
    rows.push({ name: cells[0], coords: coords[0], distance: cells[2] ?? '' });
  }
  return rows;
}

function fuelNode(raw, date, index, region) {
  const tips = ['只作参考，不必停留，也不进开销'];
  if (raw.distance) tips.push(`离当天行驶折线直线 ${raw.distance}`);
  return {
    id: `d${date.replaceAll('-', '')}-fuel${index}`,
    name: raw.name,
    category: 'landmark',
    lat: raw.coords.lat,
    lng: raw.coords.lng,
    is_optional: true,
    tips,
    cost_label: '不必停留',
    coord_confidence: 'high',
    coord_source: 'OpenStreetMap 2026-10-15',
    region,
    scene_group: '加油站，不必停留',
    tags: ['加油站'],
  };
}

function parseTable(block) {
  const lines = block.split('\n').filter((line) => line.trim().startsWith('|'));
  if (lines.length < 2) return [];
  const rows = [];
  for (const line of lines.slice(2)) {
    if (/---/.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length < 6 || !cells[0]) continue;
    rows.push({
      name: cells[0],
      dateCell: cells[1],
      coordCell: cells[2],
      commute: cells[3],
      cost: cells[4],
      note: cells[5],
    });
  }
  return rows;
}

function headingDates(title) {
  const range = title.match(/(\d+)\s*月\s*(\d+)\s*[–-]\s*(\d+)\s*日/);
  if (range) return { kind: 'range', start: isoDate(range[1], range[2]) };
  const single = title.match(/(\d+)\s*月\s*(\d+)\s*日/);
  if (single) return { kind: 'single', date: isoDate(single[1], single[2]) };
  return null;
}

function expandRow(row) {
  const coords = parseCoords(row.coordCell);
  const clock = parseClock(row.dateCell);
  const orSplit = row.name.split(/，或\s*/);
  if (orSplit.length === 2 && coords.length >= 2) {
    return [
      {
        name: orSplit[0],
        coords: coords[0],
        commute: row.commute,
        cost: row.cost,
        note: row.note,
        clock,
        optionalBranch: false,
      },
      {
        name: orSplit[1],
        coords: coords[1],
        commute: '两家之间步行 1 分钟',
        cost: '',
        note: row.note,
        clock,
        optionalBranch: true,
      },
    ];
  }
  return [
    {
      name: row.name,
      coords: coords[0] ?? null,
      commute: row.commute,
      cost: row.cost,
      note: row.note,
      clock,
      optionalBranch: false,
    },
  ];
}

function priced(item, currency, per, party, note) {
  return { item, currency, per_person: per, party, in_total: true, note };
}
function aside(item, note, currency = 'CNY') {
  return { item, currency, per_person: null, party: null, in_total: false, note };
}
function excluded(item, currency, per, party, note) {
  return { item, currency, per_person: per, party, in_total: false, note };
}
function free(item = '免费', note) {
  return { item, currency: 'CNY', per_person: 0, party: 0, in_total: true, note };
}

/** 开销说明按整理稿改写成能单独看懂的句子。票价以整理稿为准，不用行程日期里已被替换的 2 人报价。 */
const QUOTES = {
  '2027-02-09|成都双流': [
    priced('成都→墨尔本机票，广州中转', 'CNY', 5452, 21808, '南航 CZ3438 + CZ643。4 人总价是 Google 航班 4 人价'),
  ],
  '2027-02-10|墨尔本机场': [aside('已计入成都→墨尔本机票，不重复计')],
  '2027-02-10|Southern Cross': [
    priced('墨尔本 SkyBus 来回', 'AUD', 43.4, 173.6, '2 月 10 日进城，2 月 12 日去机场用同一张来回票'),
  ],
  '2027-02-10|Absolute Collins Apartments': [
    priced('墨尔本公寓 2 晚', 'CNY', 1963.25, 7853, '4 人 2 间的 Booking 列表价，还没下单'),
  ],
  '2027-02-10|弗林德斯火车站': [free()],
  '2027-02-10|圣保罗大教堂': [free()],
  '2027-02-10|皇家拱廊': [free()],
  '2027-02-10|维多利亚图书馆': [free()],
  '2027-02-10|Palermo': [aside('晚饭未计入。Palermo 和 Max 只吃一家，菜单没打开')],
  '2027-02-10|Max on Hardware': [aside('晚饭未计入。和 Palermo 只吃一家，菜单没打开')],
  '2027-02-11|酒店出发': [
    priced(
      '十二使徒团',
      'CNY',
      329,
      1316,
      '奔驰反线小团，飞猪成人价 2026-10-15。每人。4 人按单价乘 4。原来的 4 人整包 2720 元不沿用。https://a.feizhu.com/47klTR',
    ),
  ],
  '2027-02-11|回到酒店': [aside('已计入十二使徒团费，回程不另收费')],
  '2027-02-12|墨尔本机场': [aside('已计入 2 月 10 日墨尔本 SkyBus 来回票')],
  '2027-02-12|霍巴特机场': [
    priced('墨尔本→霍巴特机票', 'CNY', 647, 2588, '捷星 JQ709。这是 4 人报价，不是行程日期里 2 人的 651 元'),
  ],
  '2027-02-12|Brooke Street Pier': [
    priced('霍巴特 SkyBus 来回', 'AUD', 44, 176, '2 月 12 日进城，2 月 15 日去机场用同一张来回票'),
  ],
  '2027-02-12|Hobart Waterfront Apartments': [
    priced('霍巴特公寓 3 晚', 'CNY', 1741.25, 6965, '4 人 2 间的 Booking 列表价，还没下单'),
  ],
  '2027-02-13|萨拉曼卡集市': [free('免费', '集市入场不另收费')],
  '2027-02-13|大卫公园': [free()],
  '2027-02-13|Van Diemen\'s Land Creamery': [aside('冰淇淋未计入，菜单没打开')],
  '2027-02-13|喀斯喀特啤酒厂': [
    free('公交免费', '446 路免费到 2027-06-30。啤酒厂导览的班次和票价还没订，酒水也没计入'),
  ],
  '2027-02-14|Pennicott Wilderness Journeys': [
    priced(
      '塔斯曼半岛 3 小时巡航',
      'CNY',
      1381,
      5524,
      '分享文案没有购买链接，也没有价格。1381 元仍是原来的每人价。截图没有写午餐',
    ),
  ],
  '2027-02-14|Tasmanian Devil Unzoo': [aside('已计入塔斯曼半岛 3 小时巡航')],
  '2027-02-14|散团': [aside('已计入塔斯曼半岛 3 小时巡航')],
  '2027-02-14|回到酒店': [aside('已计入塔斯曼半岛 3 小时巡航')],
  '2027-02-15|霍巴特机场': [aside('已计入 2 月 12 日霍巴特 SkyBus 来回票')],
  '2027-02-15|悉尼机场': [
    priced('霍巴特→悉尼机票', 'CNY', 509.25, 2037, '捷星 JQ718。这是 4 人报价，不是行程日期里 2 人的 512 元'),
  ],
  '2027-02-15|环形码头': [
    priced('悉尼机场火车，进城这一趟', 'AUD', 21.64, 86.56, '非高峰。2 月 17 日去机场另计一趟，不是这张来回票'),
  ],
  '2027-02-15|悉尼歌剧院': [free('免费', '外观，没有买内场票')],
  '2027-02-15|海德公园': [free()],
  '2027-02-15|Bar Totti\'s': [aside('晚饭未计入，菜单没打开')],
  '2027-02-15|Luxury Stay in Sydney CBD': [
    priced('悉尼公寓 2 晚', 'CNY', 1558.75, 6235, '4 人 2 间的 Booking 列表价，还没下单'),
  ],
  '2027-02-16|悉尼大学主校区': [
    priced('悉尼大学巴士去程', 'AUD', 2.31, 9.24, '非高峰 0–3 公里档，只计去程。回公寓从 Porteno 走路，不再计回程'),
  ],
  '2027-02-16|Porteno': [aside('晚饭未计入，菜单没打开')],
  '2027-02-17|悉尼机场': [
    priced('悉尼机场火车，去机场这一趟', 'AUD', 21.64, 86.56, '航班 6:20，6:30 前进站，按非高峰'),
  ],
  '2027-02-17|凯恩斯机场': [priced('悉尼→凯恩斯机票', 'CNY', 533, 2132, '捷星 JQ950')],
  '2027-02-17|凯恩斯潟湖': [
    priced('凯恩斯进城公交，单程', 'AUD', 0.5, 2, '100 路，单程 0.50 澳元。2 月 21 日去机场改出租车，那一趟不在这里'),
  ],
  '2027-02-17|Aveline Dual-Key': [
    priced('凯恩斯公寓 4 晚', 'CNY', 1603.25, 6413, '4 人 2 间的 Booking 列表价，还没下单'),
  ],
  '2027-02-18|Reef Fleet Terminal': [
    priced(
      '摩尔礁，船去船回，含直升机',
      'CNY',
      2750,
      11000,
      '飞猪成人价 2026-10-15。单礁，自己到码头。约 10 分钟直升机已含。翡翠岛不含。https://a.feizhu.com/4Pldkw',
    ),
  ],
  '2027-02-18|回到码头': [aside('船回到码头。套餐费已计入码头那一笔')],
  '2027-02-18|回到公寓': [free()],
  '2027-02-20|酒店出发': [
    priced(
      '袋鼠谷中文团',
      'CNY',
      790,
      3160,
      '飞猪成人价 2026-10-15。不含午餐。页面没有加 100 元含午餐这一档。原来的 780 元不沿用。https://a.feizhu.com/1nm1gr',
    ),
  ],
  '2027-02-20|回到酒店': [aside('已计入袋鼠谷中文团费')],
  '2027-02-21|凯恩斯机场': [
    aside('去机场改出租车。100 路潟湖首班 4:00，赶不上 3:00。车费材料里没有，未计入'),
  ],
  '2027-02-21|基督城机场': [
    priced('凯恩斯→基督城机票', 'CNY', 3202, 12808, 'QF1891 + NZ146 + NZ567。6:00 起飞，当天 20:25 到'),
  ],
  '2027-02-21|Lylo Christchurch Airport': [
    priced('基督城 Lylo 2 晚', 'CNY', 928.285, 3713.14, '截图 1856.57 元是 1 间 2 成人。两间 3713.14 元，人均是两间除以 4。还没付款'),
  ],
  '2027-02-22|Riverside Market': [aside('餐饮未计入，菜单没打开')],
  '2027-02-22|植物园': [free()],
  '2027-02-22|Westfield Riccarton': [aside('自驾食品未计入')],
  '2027-02-22|回到 Lylo': [
    excluded(
      '基督城公交当天封顶',
      'NZD',
      6,
      24,
      '成人非接触 3 纽元一趟，同一张卡当天封顶 6 纽元。每人自己的卡。不折进人民币合计',
    ),
  ],
  '2027-02-23|Apex 基督城机场': [
    priced(
      '租车',
      'CNY',
      709.228125,
      2836.9125,
      '6 天报价 906 纽元，一天 151 纽元。取车 2 月 23 日、还车 2 月 28 日，5 天 755 纽元。755×3.7575 = 2836.9125。清单上的 6 天 3600 纽元不沿用',
    ),
  ],
  '2027-02-23|拉卡亚峡谷观景': [free('免费', '观景不另收费。油费记在全程')],
  '2027-02-23|奥兰季汽车旅馆': [aside('这两晚、4 人 2 间没有按 2 月 23–25 日重查，未计入')],
  '2027-02-24|好牧羊人教堂': [free('免费', '含湖边停留，停车点是 Four Square Tekapo')],
  '2027-02-25|Alpine Junction': [
    aside('这一晚没有按 2 月 25 日入住、2 月 26 日退房重查，未计入。截图 2 晚 1524 元对不上'),
  ],
  '2027-02-26|瓦纳卡跳伞': [
    priced(
      '瓦纳卡跳伞',
      'CNY',
      1436,
      5744,
      '飞猪成人价 2026-10-15，9000 英尺。4 人按单价乘 4。12000 英尺和 15000 英尺不用。清单上的 2200 元不沿用。https://a.feizhu.com/1qdw80',
    ),
  ],
  '2027-02-26|国家交通与玩具博物馆': [
    priced('玩具博物馆成人票', 'CNY', 82.665, 330.66, '成人 22 纽元。22×3.7575 = 82.665，4 人 88×3.7575 = 330.66。已折成人民币，环图不再乘一次'),
  ],
  '2027-02-26|箭镇': [free('免费', '停留不另收费')],
  '2027-02-26|Pinewood Queenstown': [
    aside('截图 3 晚 2002 元不进合计。截图是 3 月 1 日入住、3 月 4 日退房，行程是 2 月 26 日入住、3 月 1 日退房'),
  ],
  '2027-02-27|鲨鱼快艇': [
    priced(
      '鲨鱼快艇',
      'CNY',
      715,
      2860,
      '飞猪成人价 2026-10-15。Hydro Attack，自己前往。一人一条，水上 15 分钟。原来的 1000 元不沿用。https://a.feizhu.com/2MV5Gu',
    ),
  ],
  '2027-02-27|几维鸟园': [aside('票价没写，未计入')],
  '2027-02-27|天际线缆车': [
    priced(
      '天际线缆车加 3 圈滑板',
      'CNY',
      350,
      1400,
      '飞猪成人价 2026-10-15。往返缆车和山顶 3 圈是一档，不把缆车和滑板再加一次。原来的缆车 22 元、滑板 350 元分开计，不沿用。https://a.feizhu.com/0usBl7',
    ),
  ],
  '2027-02-27|天际线滑板': [aside('已计入天际线缆车加 3 圈滑板，山顶这一站不另收费')],
  '2027-02-27|皇后镇公园': [free()],
  '2027-02-27|回到松木': [free('免费', '从公园走回')],
  '2027-02-28|Milford Sound Scenic Flights Hangar': [
    priced(
      '米尔福德固定翼往返',
      'CNY',
      2745,
      10980,
      '飞猪成人价 2026-10-15。RealNZ 游船，不含午餐。自驾到 39 Lucas Place，10:00 集合。原来的 3037 元不沿用。https://a.feizhu.com/47pr0Y',
    ),
  ],
  '2027-02-28|回到松木': [aside('还车后的免费接驳只到航站楼。回松木的车费没有，未计入')],
  '2027-02-28|Apex 皇后镇机场': [aside('还车不另收费。租车费已计入 2 月 23 日 Apex 基督城机场')],
  '2027-03-01|皇后镇机场': [
    priced(
      '皇后镇→成都机票',
      'CNY',
      4059,
      16236,
      '飞猪 1 位成人含税，4 人按这个单价乘 4。这一页是 3 月 3 日的价，离开日改到 3 月 1 日之后没有重查。航班号、落到双流还是天府都还没对上',
    ),
  ],
  '2027-03-01|成都': [aside('已计入上一站的皇后镇→成都机票。双流或天府还没定')],
};

function quotesFor(date, name) {
  return QUOTES[`${date}|${name}`] ?? [];
}

function quotesForNode(date, raw, peers = []) {
  const manual = quotesFor(date, raw.name);
  const twins = peers.filter((item) => item.name === raw.name);
  if (manual.length && twins.length > 1) {
    const manualHasPrice = manual.some((quote) => quote.in_total && quote.per_person);
    const carriesPrice = /\d/.test(raw.cost);
    if (manualHasPrice && !carriesPrice) {
      if (/车费没有/.test(raw.note)) return [aside('还车后回松木的车费没有，未计入')];
      return [];
    }
  }
  if (manual.length) return manual;
  if (raw.cost.trim() === '0') return [free('免费', '不另收费')];
  if (raw.cost.trim() === '含') return [aside('含在当天团费里，不另收费')];
  return [];
}

function purchaseUrls(text) {
  const urls = [];
  const re = /\[购买\]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = re.exec(text || ''))) urls.push(match[1]);
  return urls;
}

function formatAmount(amount) {
  if (Number.isInteger(amount)) return String(amount);
  return (Math.round(amount * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
}

function cardLabel(quotes) {
  if (quotes.length === 0) return undefined;
  return quotes
    .map((quote) => {
      if (quote.per_person == null || quote.per_person === 0) return quote.item;
      const unit = quote.currency === 'CNY' ? '元' : quote.currency === 'AUD' ? '澳元' : '纽元';
      const amount = formatAmount(quote.per_person);
      return `${quote.item}，人均 ${amount} ${unit}`;
    })
    .join('；');
}

function nodeFrom(raw, date, index, region, intro, peers = []) {
  const hasCoord = Boolean(raw.coords);
  const tips = [];
  if (index === 1 && intro) tips.push(intro);
  if (raw.note) tips.push(raw.note);
  if (raw.commute) tips.push(`上一站：${raw.commute}`);
  if (!hasCoord) tips.push('这份材料里没有这一站的坐标，地图上不钉点');
  const regionName = /^成都/.test(raw.name) || raw.name === '成都' ? '成都' : region;
  const quotes = quotesForNode(date, raw, peers);
  return {
    id: `d${date.replaceAll('-', '')}-n${index}`,
    name: raw.name,
    category: categoryOf(raw.name),
    lat: hasCoord ? raw.coords.lat : 0,
    lng: hasCoord ? raw.coords.lng : 0,
    ...raw.clock,
    is_optional: raw.optionalBranch,
    tips,
    cost_label: cardLabel(quotes),
    cost_quotes: quotes.length ? quotes : undefined,
    coord_confidence: hasCoord ? 'high' : 'none',
    coord_source: '澳新行程整理',
    region: regionName,
    optionalBranch: raw.optionalBranch,
    commute: raw.commute,
    checkIn: categoryOf(raw.name) === 'hotel' && /入住/.test(raw.note),
  };
}

function edgeBetween(from, to, type) {
  const commute = to.commute || '';
  const edge = {
    id: `e-${from.id}-${to.id}`,
    from: from.id,
    to: to.id,
    type,
    transport_mode: transportMode(commute),
    duration_minutes: parseDuration(commute),
    label: commute || undefined,
    route_source: commute ? 'user_hint' : 'estimate',
  };
  const distance = parseDistance(commute);
  if (distance != null) edge.distance_meters = distance;
  return edge;
}

function chainDay(nodes) {
  const edges = [];
  const chain = [];
  for (const node of nodes) {
    if (node.optionalBranch) {
      const prev = chain[chain.length - 1];
      if (prev) edges.push(edgeBetween(prev, node, 'primary'));
      continue;
    }
    const prev = chain[chain.length - 1];
    if (prev) edges.push(edgeBetween(prev, node, 'primary'));
    chain.push(node);
  }
  return edges;
}

function stripBuildFields(node) {
  const { optionalBranch, commute, checkIn, ...rest } = node;
  return rest;
}

function checkoutDate(note, fallback) {
  const stay = note.match(/住到\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (stay) return isoDate(stay[1], stay[2]);
  const leave = note.match(/(\d+)\s*月\s*(\d+)\s*日早上离开/);
  if (leave) return isoDate(leave[1], leave[2]);
  const out = note.match(/退房写成\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (out) return isoDate(out[1], out[2]);
  return fallback;
}

const md = fs.readFileSync(mdPath, 'utf8');
const tripBlock = md.split('## 开销')[0].split('## 行程')[1];
if (!tripBlock) throw new Error('找不到 ## 行程');

const sections = tripBlock.split('\n### ').slice(1);
const summary = sections.find((section) => section.startsWith('日程'));
if (!summary) throw new Error('找不到日程表');

const schedule = new Map();
for (const line of summary.split('\n').filter((item) => item.trim().startsWith('|'))) {
  if (/---/.test(line) || /日期/.test(line)) continue;
  const cells = splitRow(line);
  const date = parseMdDate(cells[0] ?? '');
  if (!date || cells.length < 4) continue;
  schedule.set(date, {
    weekday: WEEKDAY[cells[1]] ?? cells[1],
    stay: cells[2],
    blurb: cells[3],
  });
}

const rowsByDate = new Map();
const fuelByDate = new Map();
const introByDate = new Map();
for (const section of sections) {
  if (section.startsWith('日程')) continue;
  const title = section.split('\n')[0];
  const when = headingDates(title);
  if (!when) continue;
  const body = section.split('\n').slice(1).join('\n');
  const tableAt = body.indexOf('\n|');
  const intro = (tableAt === -1 ? body : body.slice(0, tableAt))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('|'))
    .join('');
  const rows = parseTable(body);
  const fuelRows = parseFuelRows(body);
  if (fuelRows.length) {
    if (when.kind !== 'single') throw new Error(`加油站表不在单日标题下：${title}`);
    fuelByDate.set(when.date, fuelRows);
  }
  const dated = new Map();
  for (const row of rows) {
    const rowDate = parseMdDate(row.dateCell);
    const date = when.kind === 'single' ? when.date : rowDate;
    if (!date) throw new Error(`行没有日期：${row.name}`);
    if (!dated.has(date)) dated.set(date, []);
    dated.get(date).push(...expandRow(row));
  }
  if (dated.size === 0 && when.kind === 'single') {
    introByDate.set(when.date, intro);
  }
  const datedKeys = [...dated.keys()];
  for (const [date, list] of dated) {
    if (!rowsByDate.has(date)) rowsByDate.set(date, []);
    rowsByDate.get(date).push(...list);
  }
  const introDate = datedKeys[datedKeys.length - 1];
  if (intro && introDate) introByDate.set(introDate, intro);
}

const days = [];
for (const [date, info] of schedule) {
  const region = REGION_BY_DATE[date] ?? '其他';
  const intro = introByDate.get(date) || '';
  const raws = rowsByDate.get(date) ?? [];
  let built;
  if (raws.length === 0) {
    const name = date === '2027-03-04' ? '退房日' : '这一天没有节点';
    built = [
      nodeFrom(
        {
          name,
          coords: null,
          commute: '',
          cost: '',
          note: intro || info.blurb,
          clock: {},
          optionalBranch: false,
        },
        date,
        1,
        region,
        '',
      ),
    ];
  } else {
    built = raws.map((raw, i) => nodeFrom(raw, date, i + 1, region, i === 0 ? intro : '', raws));
  }
  const fuels = (fuelByDate.get(date) ?? []).map((raw, i) => fuelNode(raw, date, i + 1, region));
  const edges = chainDay(built);
  built = [...built, ...fuels];
  const introUrls = purchaseUrls(intro);
  const pricedNode =
    built.find((node) => (node.cost_quotes ?? []).some((quote) => quote.in_total && quote.per_person)) ??
    built[0];
  for (const node of built) {
    const own = purchaseUrls((node.tips ?? []).join('\n'));
    const urls = [...new Set([...own, ...(node === pricedNode ? introUrls : [])])];
    if (!urls.length) continue;
    node.evidence_refs = urls.map((url) => ({ url, title: '购买', role: 'purchase' }));
  }
  days.push({
    day_index: days.length + 1,
    date,
    weekday: info.weekday,
    label: info.blurb || intro || info.stay || date,
    region,
    nodes: built.map(stripBuildFields),
    edges,
  });
}

const crossDay = [];
let prev = null;
for (const day of days) {
  const first = day.nodes[0];
  const anchor = [...day.nodes].reverse().find((node) => !node.is_optional);
  if (prev && first) {
    const commute =
      first.tips?.find((tip) => tip.startsWith('上一站：'))?.replace(/^上一站：/, '') ?? '';
    const edge = {
      id: `xd-${prev.id}-${first.id}`,
      from: prev.id,
      to: first.id,
      type: 'primary',
      transport_mode: transportMode(commute),
      duration_minutes: parseDuration(commute),
      label: commute || '跨日',
      route_source: commute ? 'user_hint' : 'estimate',
    };
    const distance = parseDistance(commute);
    if (distance != null) edge.distance_meters = distance;
    crossDay.push(edge);
  }
  if (anchor) prev = anchor;
}

const hotels = [];
for (const day of days) {
  for (const node of day.nodes) {
    const note = (node.tips ?? []).find((tip) => /住到|退房写成|早上离开/.test(tip));
    if (!note || node.lat === 0 || node.category !== 'hotel') continue;
    hotels.push({
      id: `hotel-${node.id}`,
      sequence: hotels.length + 1,
      city: node.region,
      name: node.name,
      check_in: day.date,
      check_out: checkoutDate(note, day.date),
      is_primary: true,
      is_anchor: true,
      booking_status: 'selected',
      itinerary_node_id: node.id,
      lat: node.lat,
      lng: node.lng,
      purchase_url: HOTEL_URL[node.name],
    });
  }
}

const flights = [
  flight({
    id: 'fl-anz-1',
    sequence: 1,
    role: 'outbound',
    origin: 'CTU',
    dest: 'MEL',
    depart: '2027-02-09T13:30:00+08:00',
    arrive: '2027-02-10T06:50:00+11:00',
    airline: '南航',
    numbers: ['CZ3438', 'CZ643'],
    stops: 1,
    duration: 860,
    price: 5452,
    label: '成都双流 → 墨尔本，广州中转。人均 5452 元，4 人 21808 元。还不是订单',
  }),
  flight({
    id: 'fl-anz-2',
    sequence: 2,
    role: 'intercity',
    origin: 'MEL',
    dest: 'HBA',
    depart: '2027-02-12T14:55:00+11:00',
    arrive: '2027-02-12T16:10:00+11:00',
    airline: '捷星',
    numbers: ['JQ709'],
    stops: 0,
    duration: 75,
    price: 647,
    label: '墨尔本 → 霍巴特。人均 647 元，4 人 2588 元',
  }),
  flight({
    id: 'fl-anz-3',
    sequence: 3,
    role: 'intercity',
    origin: 'HBA',
    dest: 'SYD',
    depart: '2027-02-15T08:35:00+11:00',
    arrive: '2027-02-15T10:30:00+11:00',
    airline: '捷星',
    numbers: ['JQ718'],
    stops: 0,
    duration: 115,
    price: 509.25,
    label: '霍巴特 → 悉尼。人均 509.25 元，4 人 2037 元',
  }),
  flight({
    id: 'fl-anz-4',
    sequence: 4,
    role: 'intercity',
    origin: 'SYD',
    dest: 'CNS',
    depart: '2027-02-17T06:20:00+11:00',
    arrive: '2027-02-17T08:20:00+10:00',
    airline: '捷星',
    numbers: ['JQ950'],
    stops: 0,
    duration: 180,
    price: 533,
    label: '悉尼 → 凯恩斯。人均 533 元，4 人 2132 元',
  }),
  flight({
    id: 'fl-anz-5',
    sequence: 5,
    role: 'intercity',
    origin: 'CNS',
    dest: 'CHC',
    depart: '2027-02-21T06:00:00+10:00',
    arrive: '2027-02-21T20:25:00+13:00',
    airline: '澳航 / 新西兰航空',
    numbers: ['QF1891', 'NZ146', 'NZ567'],
    stops: 2,
    duration: 685,
    price: 3202,
    label: '凯恩斯 → 基督城，布里斯班、奥克兰中转。人均 3202 元，4 人 12808 元。当天 20:25 到',
  }),
  flight({
    id: 'fl-anz-6',
    sequence: 6,
    role: 'return',
    origin: 'ZQN',
    dest: 'CTU',
    depart: '2027-03-01T15:05:00+13:00',
    arrive: '2027-03-01T15:05:00+13:00',
    airline: '未对上时刻表',
    numbers: [],
    stops: 1,
    duration: 0,
    price: 4059,
    label: '皇后镇 3 月 1 日 15:05 飞成都，中转。人均 4059 元是 3 月 3 日那一页，离开日改期后没有重查。双流或天府、航班号、到达钟点都还没定。到达时间先空着，这里写成与起飞相同',
    confidence: 'low',
  }),
];

function flight(spec) {
  const quote = {
    id: spec.id,
    origin_iata: spec.origin,
    dest_iata: spec.dest,
    airline: spec.airline,
    route_label: spec.label,
    depart_time: spec.depart,
    arrive_time: spec.arrive,
    duration_minutes: spec.duration,
    stops: spec.stops,
    price_amount: spec.price,
    price_currency: 'CNY',
    source: 'manual',
    confidence: spec.confidence ?? 'medium',
    flight_numbers: spec.numbers,
    trip_type: 'one_way',
  };
  return {
    id: spec.id,
    sequence: spec.sequence,
    role: spec.role,
    origin_iata: spec.origin,
    dest_iata: spec.dest,
    depart_at: spec.depart,
    arrive_at: spec.arrive,
    airline: spec.airline,
    flight_numbers: spec.numbers,
    stops: spec.stops,
    duration_minutes: spec.duration,
    quote,
    quote_id: spec.id,
    booking_status: 'selected',
    is_anchor: spec.role === 'outbound' || spec.role === 'return',
  };
}

const mapped = days.reduce((sum, day) => sum + day.nodes.filter((n) => n.lat !== 0 || n.lng !== 0).length, 0);
const payload = {
  itinerary: {
    id: 'anz-2027-02-09',
    title: '澳新行程',
    destination: '澳大利亚、新西兰',
    timezone: 'Australia/Sydney',
    days,
    cross_day_edges: crossDay,
    meta: {
      generated_at: '2026-10-15T17:30:00+08:00',
      model: 'anz-itinerary-v10',
      expense_extras: [
        priced(
          '油费',
          'CNY',
          111.25,
          445,
          '一辆车 635.1 公里。还车 8.4 公里记在 2 月 28 日，总公里不变。118.55 纽元已按 3.7575 折成 445.45 元后取整。这里记人民币，环图不再乘一次',
        ),
      ],
      locale: 'zh-CN',
      warnings: [
        '坐标和通勤来自澳新行程整理，没有重新地理编码。',
        '开车在现有交通方式里没有单独一项，图上用出租车图标，边上的字仍是开车或自驾。顺路、山路和整点已单列成站。',
        '没有坐标的站只出现在流程图上。',
        '人均人民币合计 33596.178125 元，4 人 134384.7125 元。报团按 2026-10-15 飞猪成人价。没有地面坐标的站只出现在流程图上，地图连线会跳过它们。地面交通另计澳元，不折进这一笔。奥兰季两晚、阿尔卑斯交会镇这一晚、松木 3 晚不在合计里。基督城公交、凯恩斯去机场的出租车、3 月 1 日去机场的车费不在合计里。2 月 28 日去 Apex 还车是自己开车，不打车。回程 4059 元是 3 月 3 日那一页，3 月 1 日没有重查。',
      ],
      evidence_status: 'empty',
    },
  },
  hotels,
  flights,
};

const names = days.flatMap((day) => day.nodes.map((node) => `${day.date} ${node.name}`));
const must = [
  '2027-02-09 成都双流',
  '2027-02-10 Palermo',
  '2027-02-10 Max on Hardware',
  '2027-02-11 吉布森石阶',
  '2027-02-11 十二使徒',
  '2027-02-11 洛克阿德大峡谷',
  '2027-02-11 Great Ocean Road Wildlife Park',
  '2027-02-14 Pennicott Wilderness Journeys',
  '2027-02-14 亚瑟港',
  '2027-02-14 皮勒角',
  '2027-02-14 鹰颈峡',
  '2027-02-14 Tasmanian Devil Unzoo',
  '2027-02-18 摩尔礁',
  '2027-02-20 金字塔山',
  '2027-02-20 袋鼠谷',
  '2027-02-20 帕罗尼拉公园',
  '2027-02-20 米拉米拉瀑布',
  '2027-02-27 天际线滑板',
  '2027-02-28 Milford Sound Scenic Flights Hangar',
  '2027-02-28 米尔福德峡湾机场',
  '2027-02-28 峡湾游船',
  '2027-02-18 Reef Fleet Terminal',
  '2027-02-19 这一天没有节点',
  '2027-02-22 回到 Lylo',
  '2027-02-23 Apex 基督城机场',
  '2027-02-23 开车满 1 小时',
  '2027-02-23 杰拉尔丁',
  '2027-02-23 奥兰季汽车旅馆',
  '2027-02-24 伯克斯山口',
  '2027-02-24 好牧羊人教堂',
  '2027-02-24 回到奥兰季',
  '2027-02-25 林迪斯山口',
  '2027-02-25 Alpine Junction',
  '2027-02-26 瓦纳卡跳伞',
  '2027-02-26 皇冠山脉鞍部',
  '2027-02-26 箭镇',
  '2027-02-26 Pinewood Queenstown',
  '2027-02-27 鲨鱼快艇',
  '2027-02-27 天际线滑板',
  '2027-02-27 回到松木',
  '2027-02-28 回到松木',
  '2027-02-28 Apex 皇后镇机场',
  '2027-03-01 皇后镇机场',
  '2027-03-01 成都',
];
for (const item of must) {
  if (!names.includes(item)) throw new Error(`缺节点 ${item}`);
}
for (const key of Object.keys(QUOTES)) {
  const [date, name] = key.split('|');
  if (!names.includes(`${date} ${name}`)) throw new Error(`报价没有节点 ${key}`);
}
if (days.length !== 21) throw new Error(`天数 ${days.length}`);
if (hotels.length !== 8) throw new Error(`酒店 ${hotels.length}：${hotels.map((h) => h.name).join(',')}`);
if (mapped < 60) throw new Error(`可上地图的点太少 ${mapped}`);
const fuelExpect = {
  '2027-02-23': 13,
  '2027-02-24': 4,
  '2027-02-25': 12,
  '2027-02-26': 5,
  '2027-02-28': 6,
};
for (const day of days) {
  const fuels = day.nodes.filter((node) => (node.tags ?? []).includes('加油站'));
  const expect = fuelExpect[day.date] ?? 0;
  if (fuels.length !== expect) throw new Error(`${day.date} 加油站 ${fuels.length}，应为 ${expect}`);
  if (fuels.some((node) => !node.is_optional || node.lat === 0)) {
    throw new Error(`${day.date} 加油站被写成必经或没有坐标`);
  }
  const fuelIds = new Set(fuels.map((node) => node.id));
  if (day.edges.some((edge) => fuelIds.has(edge.from) || fuelIds.has(edge.to))) {
    throw new Error(`${day.date} 加油站被连进路线`);
  }
}

const quotes = [
  ...days.flatMap((day) => day.nodes.flatMap((node) => node.cost_quotes ?? [])),
  ...payload.itinerary.meta.expense_extras,
];
const sum = (currency, field) =>
  Math.round(
    quotes
      .filter((quote) => quote.in_total && quote.currency === currency)
      .reduce((total, quote) => total + quote[field], 0) * 1e6,
  ) / 1e6;
if (sum('CNY', 'per_person') !== 33596.178125) throw new Error(`人民币人均 ${sum('CNY', 'per_person')}`);
if (sum('CNY', 'party') !== 134384.7125) throw new Error(`人民币 4 人 ${sum('CNY', 'party')}`);
if (sum('AUD', 'per_person') !== 133.49) throw new Error(`澳元人均 ${sum('AUD', 'per_person')}`);
if (sum('AUD', 'party') !== 533.96) throw new Error(`澳元 4 人 ${sum('AUD', 'party')}`);
if (sum('NZD', 'per_person') !== 0) throw new Error(`纽元人均 ${sum('NZD', 'per_person')}`);
const badLabel = days
  .flatMap((day) => day.nodes)
  .map((node) => node.cost_label)
  .find((label) => label && /含在上一行|含在来回票里|^含$|^不另收费$/.test(label));
if (badLabel) throw new Error(`开销说法还没改写：${badLabel}`);

fs.writeFileSync(outPath, `${JSON.stringify(payload)}\n`);
console.log(
  `anzTrip ok days=${days.length} nodes=${names.length} mapped=${mapped} hotels=${hotels.length} flights=${flights.length} cross=${crossDay.length}`,
);
