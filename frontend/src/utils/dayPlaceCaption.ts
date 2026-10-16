import type { DayPlan, ItineraryNode } from '../types/itinerary';
import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedHotelStay } from '../types/travelIntel';
import { cityForDayDate } from './citySegments';

export interface DayPlaceCaption {
  country: string;
  city: string;
  /** 日期卡上的短句 */
  highlight: string;
  /** 短句被截过时，悬停用的完整说明 */
  detail: string;
  placeLine: string;
}

/**
 * 城市中文名 → 国家。机场数据里的城市，加上自驾常写、库里没有中文别名的城。
 * 键按长度从长到短匹配，避免「胡志明」抢在「胡志明市」前面。
 */
const CITY_COUNTRY: Record<string, string> = {
  胡志明市: '越南',
  圣弗朗西斯科: '美国',
  哥打巴鲁: '马来西亚',
  吉隆坡: '马来西亚',
  阿布扎比: '阿联酋',
  亚罗士打: '马来西亚',
  弗朗茨约瑟夫: '新西兰',
  因弗卡吉尔: '新西兰',
  黄金海岸: '澳大利亚',
  布里斯班: '澳大利亚',
  阿德莱德: '澳大利亚',
  罗托鲁瓦: '新西兰',
  基督城: '新西兰',
  皇后镇: '新西兰',
  惠灵顿: '新西兰',
  霍基蒂卡: '新西兰',
  格雷茅斯: '新西兰',
  但尼丁: '新西兰',
  汉密尔顿: '新西兰',
  富国岛: '越南',
  下龙湾: '越南',
  堪培拉: '澳大利亚',
  霍巴特: '澳大利亚',
  凯恩斯: '澳大利亚',
  蒂阿瑙: '新西兰',
  凯库拉: '新西兰',
  库克山: '新西兰',
  特卡波: '新西兰',
  瓦纳卡: '新西兰',
  费尔利: '新西兰',
  皮克顿: '新西兰',
  尼尔森: '新西兰',
  奥克兰: '新西兰',
  墨尔本: '澳大利亚',
  悉尼: '澳大利亚',
  珀斯: '澳大利亚',
  达尔文: '澳大利亚',
  胡志明: '越南',
  西贡: '越南',
  芽庄: '越南',
  会安: '越南',
  顺化: '越南',
  美奈: '越南',
  大叻: '越南',
  河内: '越南',
  岘港: '越南',
  曼谷: '泰国',
  清迈: '泰国',
  普吉岛: '泰国',
  普吉: '泰国',
  新加坡: '新加坡',
  亚庇: '马来西亚',
  槟城: '马来西亚',
  兰卡威: '马来西亚',
  古晋: '马来西亚',
  新山: '马来西亚',
  怡保: '马来西亚',
  关丹: '马来西亚',
  美里: '马来西亚',
  诗巫: '马来西亚',
  斗湖: '马来西亚',
  纳闽: '马来西亚',
  民都鲁: '马来西亚',
  丁加奴: '马来西亚',
  巴厘岛: '印度尼西亚',
  登巴萨: '印度尼西亚',
  雅加达: '印度尼西亚',
  东京: '日本',
  大阪: '日本',
  京都: '日本',
  首尔: '韩国',
  釜山: '韩国',
  北京: '中国',
  上海: '中国',
  广州: '中国',
  深圳: '中国',
  成都: '中国',
  杭州: '中国',
  西安: '中国',
  重庆: '中国',
  南京: '中国',
  武汉: '中国',
  厦门: '中国',
  青岛: '中国',
  大连: '中国',
  香港: '香港',
  澳门: '澳门',
  台北: '台湾',
  高雄: '台湾',
  巴黎: '法国',
  伦敦: '英国',
  纽约: '美国',
  洛杉矶: '美国',
  旧金山: '美国',
  迪拜: '阿联酋',
  多哈: '卡塔尔',
  法兰克福: '德国',
  阿姆斯特丹: '荷兰',
  罗马: '意大利',
  巴塞罗那: '西班牙',
  马德里: '西班牙',
  金边: '柬埔寨',
  暹粒: '柬埔寨',
  吴哥: '柬埔寨',
  马尼拉: '菲律宾',
  箭镇: '新西兰',
};

const CITY_KEYS = Object.keys(CITY_COUNTRY).sort((a, b) => b.length - a.length);

/** 长名在前，避免「印度」吃掉「印度尼西亚」、「马来」吃掉「马来西亚」。 */
const COUNTRY_ALIASES: Array<[string, string]> = [
  ['印度尼西亚', '印度尼西亚'],
  ['沙特阿拉伯', '沙特阿拉伯'],
  ['马来西亚', '马来西亚'],
  ['澳大利亚', '澳大利亚'],
  ['斯里兰卡', '斯里兰卡'],
  ['毛里求斯', '毛里求斯'],
  ['马尔代夫', '马尔代夫'],
  ['新加坡', '新加坡'],
  ['新西兰', '新西兰'],
  ['菲律宾', '菲律宾'],
  ['柬埔寨', '柬埔寨'],
  ['摩洛哥', '摩洛哥'],
  ['印度', '印度'],
  ['印尼', '印度尼西亚'],
  ['澳洲', '澳大利亚'],
  ['马来', '马来西亚'],
  ['沙特', '沙特阿拉伯'],
  ['南韩', '韩国'],
  ['韩国', '韩国'],
  ['越南', '越南'],
  ['泰国', '泰国'],
  ['日本', '日本'],
  ['中国', '中国'],
  ['美国', '美国'],
  ['英国', '英国'],
  ['法国', '法国'],
  ['德国', '德国'],
  ['意大利', '意大利'],
  ['西班牙', '西班牙'],
  ['荷兰', '荷兰'],
  ['瑞士', '瑞士'],
  ['奥地利', '奥地利'],
  ['加拿大', '加拿大'],
  ['墨西哥', '墨西哥'],
  ['巴西', '巴西'],
  ['埃及', '埃及'],
  ['土耳其', '土耳其'],
  ['阿联酋', '阿联酋'],
  ['卡塔尔', '卡塔尔'],
  ['台湾', '台湾'],
  ['香港', '香港'],
  ['澳门', '澳门'],
  ['老挝', '老挝'],
  ['缅甸', '缅甸'],
  ['尼泊尔', '尼泊尔'],
  ['斐济', '斐济'],
  ['南非', '南非'],
  ['肯尼亚', '肯尼亚'],
  ['希腊', '希腊'],
  ['葡萄牙', '葡萄牙'],
  ['爱尔兰', '爱尔兰'],
  ['瑞典', '瑞典'],
  ['挪威', '挪威'],
  ['芬兰', '芬兰'],
  ['丹麦', '丹麦'],
  ['冰岛', '冰岛'],
  ['波兰', '波兰'],
  ['捷克', '捷克'],
  ['匈牙利', '匈牙利'],
  ['比利时', '比利时'],
  ['俄罗斯', '俄罗斯'],
  ['以色列', '以色列'],
].sort((a, b) => b[0].length - a[0].length);

const GENERIC_LABEL = /^(第\s*\d+\s*天|day\s*\d+|行程)$/i;

function matchCity(name: string): { key: string; country: string } | null {
  const raw = name.trim();
  if (!raw) return null;
  const exact = CITY_COUNTRY[raw];
  if (exact) return { key: raw, country: exact };
  for (const key of CITY_KEYS) {
    if (raw.includes(key)) return { key, country: CITY_COUNTRY[key] };
  }
  return null;
}

function countriesIn(text: string): string[] {
  const found: string[] = [];
  let rest = text;
  for (const [alias, canon] of COUNTRY_ALIASES) {
    if (!rest.includes(alias)) continue;
    if (!found.includes(canon)) found.push(canon);
    rest = rest.split(alias).join(' ');
  }
  return found;
}

/** 整段就是一个国家名（「澳洲」→ 澳大利亚）；夹了城市名则不算。 */
function pureCountryLabel(name: string): string | null {
  const raw = name.trim();
  if (!raw) return null;
  const hits = countriesIn(raw);
  if (hits.length !== 1) return null;
  let rest = raw;
  for (const [alias] of COUNTRY_ALIASES) {
    rest = rest.split(alias).join('');
  }
  if (rest.replace(/[\s·•,，、/\-—]+/g, '') !== '') return null;
  return hits[0];
}

function singleDestinationCountry(destination: string): string {
  const hits = countriesIn(destination);
  return hits.length === 1 ? hits[0] : '';
}

function cityFromRegion(region: string | undefined): string {
  return matchCity(region ?? '')?.key ?? '';
}

function placeFromRegion(region: string | undefined): { country: string; city: string } | null {
  const name = (region ?? '').trim();
  const hit = matchCity(name);
  if (!hit) return null;
  if (hit.country === name) return { country: hit.country, city: '' };
  return { country: hit.country, city: name };
}

/**
 * 没有城段时，cityForDayDate 会把整个目的地当成城市。
 * 「澳大利亚、新西兰」这种跨国目的地不能贴到每一天，改看当天区域。
 */
function isDestinationBlob(name: string): boolean {
  return countriesIn(name).length >= 2;
}

function resolvePlace(
  day: Pick<DayPlan, 'date' | 'region'>,
  trip: TripRequest,
  hotels?: ConfirmedHotelStay[] | null,
): { country: string; city: string } {
  const located = cityForDayDate(day.date, trip, hotels);
  const rawCity = (located?.city ?? '').trim();
  const fromCity = matchCity(rawCity);

  if (fromCity && !isDestinationBlob(rawCity)) {
    if (fromCity.country === rawCity) return { country: fromCity.country, city: '' };
    return { country: fromCity.country, city: rawCity };
  }

  const asCountry = pureCountryLabel(rawCity);
  if (asCountry || isDestinationBlob(rawCity) || !rawCity) {
    return placeFromRegion(day.region) ?? { country: asCountry ?? '', city: '' };
  }

  const country = singleDestinationCountry(trip.destination ?? '');
  const city = rawCity !== country ? rawCity : cityFromRegion(day.region);
  return { country, city: city === country ? '' : city };
}

/** 长说明收成一眼能看完的短语；标题里用 · 分开的主题保持原样。 */
function shortenHighlight(text: string): string {
  const stripped = text
    .replace(/^\d{1,2}:\d{2}(?:\s*[–\-到至]\s*\d{1,2}:\d{2})?\s*/, '')
    .trim();
  const sentences = stripped
    .split(/[。；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  let sentence = sentences[0] ?? stripped;
  if (sentence.length <= 3 && sentences[1]) sentence = sentences[1];
  if (sentence.length <= 14) return sentence;
  const chunk = sentence.split(/[，,、]/)[0]?.trim() ?? sentence;
  return chunk || sentence;
}

function labelHighlight(label: string): { short: string; detail: string } {
  const pieces = label
    .split(/\s*[·•|｜]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !GENERIC_LABEL.test(part));
  const detail = pieces.at(-1) ?? '';
  if (!detail) return { short: '', detail: '' };
  const themed = /[·•|｜]/.test(label);
  const short = themed ? detail : shortenHighlight(detail);
  return { short, detail: detail === short ? '' : detail };
}

function signatureStop(nodes: ItineraryNode[]): string {
  const sights = nodes.filter(
    (node) => node.category === 'attraction' || node.category === 'landmark',
  );
  const required = sights.filter((node) => !node.is_optional);
  const list = required.length ? required : sights;
  if (!list.length) return '';
  const bestMinutes = Math.max(...list.map((node) => node.duration_minutes ?? 0));
  const picked =
    bestMinutes > 0
      ? list.find((node) => (node.duration_minutes ?? 0) === bestMinutes)
      : list[0];
  return picked?.name.trim() ?? '';
}

function transitHint(nodes: ItineraryNode[]): string {
  if (!nodes.length) return '';
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const firstAir = first?.category === 'airport';
  const lastAir = last?.category === 'airport';
  if (firstAir && !lastAir) return '抵达';
  if (lastAir && !firstAir) return '离开';
  if (firstAir && lastAir) return '过境';
  return '';
}

function dayHighlight(
  day: Pick<DayPlan, 'label' | 'nodes'>,
  city: string,
  country: string,
): { highlight: string; detail: string } {
  const fromLabel = labelHighlight(day.label ?? '');
  let highlight = fromLabel.short;
  let detail = fromLabel.detail;
  if (!highlight) {
    highlight = signatureStop(day.nodes ?? []) || transitHint(day.nodes ?? []);
    detail = '';
  }
  if (!highlight || highlight === city || highlight === country) {
    return { highlight: '', detail: '' };
  }
  return { highlight, detail };
}

export function formatDayPlaceLine(country: string, city: string): string {
  if (country && city && country !== city) return `${country} · ${city}`;
  return country || city || '';
}

export function dayPlaceCaption(
  day: Pick<DayPlan, 'date' | 'label' | 'region' | 'nodes'>,
  trip: TripRequest,
  hotels?: ConfirmedHotelStay[] | null,
): DayPlaceCaption {
  const { country, city } = resolvePlace(day, trip, hotels);
  const { highlight, detail } = dayHighlight(day, city, country);
  return {
    country,
    city,
    highlight,
    detail,
    placeLine: formatDayPlaceLine(country, city),
  };
}
