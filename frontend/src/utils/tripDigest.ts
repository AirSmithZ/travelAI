import type { DayPlan, ItineraryNode } from '../types/itinerary';
import catalogJson from '../data/highlightCatalog.json';

/**
 * 亮点摘自 `out/澳大利亚/亮点参考.json` 与 `out/新西兰/亮点参考.json`。
 * 只留名称、短说明和分组。讨论参考改过之后，要重跑摘录再写入
 * `src/data/highlightCatalog.json`。
 */
export interface CatalogHighlight {
  country: string;
  city: string;
  group: string;
  name: string;
  why: string;
}

export const HIGHLIGHT_CATALOG = catalogJson as CatalogHighlight[];

export const HIGHLIGHT_GROUP_ORDER = ['已有', '同城可加', '一日可达', '新基地候选', '已注释'] as const;

/** 过夜区域 → 亮点库里的城。费尔利库里没有，湖区项目记在蒂卡波。 */
const REGION_LINKS: Record<string, { country: string; cities: string[]; note?: string }> = {
  成都: { country: '中国', cities: [], note: '出发和回程，不排目的地亮点。' },
  墨尔本: { country: '澳大利亚', cities: ['墨尔本'] },
  霍巴特: {
    country: '澳大利亚',
    cities: ['霍巴特'],
    note: '塔斯曼半岛的项目记在霍巴特。',
  },
  悉尼: { country: '澳大利亚', cities: ['悉尼'] },
  凯恩斯: { country: '澳大利亚', cities: ['凯恩斯'] },
  基督城: { country: '新西兰', cities: ['基督城'] },
  费尔利: {
    country: '新西兰',
    cities: ['蒂卡波'],
    note: '亮点库没有费尔利，湖区项目记在蒂卡波。',
  },
  瓦纳卡: { country: '新西兰', cities: ['瓦纳卡'] },
  皇后镇: {
    country: '新西兰',
    cities: ['皇后镇'],
    note: '米尔福德峡湾记在皇后镇。',
  },
};

export interface DigestDay {
  /** 行程数组下标，总览滚动用 */
  index: number;
  dayNumber: number;
  date: string;
  weekday: string;
  label: string;
  region: string;
}

export type HighlightMark =
  | { status: 'in' }
  | { status: 'other'; date: string; weekday: string; region: string }
  | { status: 'out' };

export interface DigestHighlight extends CatalogHighlight {
  mark: HighlightMark;
}

export interface DigestStay {
  region: string;
  country: string;
  note: string;
  days: DigestDay[];
  highlights: DigestHighlight[];
}

export interface TripDigest {
  dayCount: number;
  dateStart: string;
  dateEnd: string;
  stays: DigestStay[];
  /** 亮点库里有、这趟没有任何一段挂上的城 */
  asideCities: { city: string; country: string; note: string }[];
}

const WEAK = new Set([
  '咖啡',
  '网红店',
  '推荐',
  '清单',
  '来自',
  '成人',
  '儿童',
  '方案',
  '步行',
  '开车',
  '前往',
  '途中',
  '观景',
  '可选',
  '可选项',
  '早餐',
  '超市',
  '零食',
  '商圈',
  '市场',
  'market',
  'street',
  'land',
  'van',
  'the',
  'and',
  'bar',
  'for',
  'with',
  'from',
  'gelato',
  'national',
  'museum',
  'lookout',
  'point',
]);

/** 太泛，不能用来判断「写在别的日期」，避免凯恩斯的跳伞对上瓦纳卡。 */
const CROSS_BLOCK = new Set(['跳伞', '公园', '植物园', '教堂', '市集', '缆车', '滑板', '咖啡', '瀑布', '游船', '巡航']);

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/州立/g, '')
    .replace(/圣戴维/g, '大卫')
    .replace(/[`'’]/g, '')
    .replace(/街(?=火车)/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function extraNeedles(name: string): string[] {
  const latin = name.toLowerCase();
  const out: string[] = [];
  if (/大堡礁|外礁|摩尔/.test(name)) out.push('摩尔礁');
  if (/gelato|cremagry|creamery|冰淇淋|siemens/.test(latin)) out.push('creamery');
  if (/rakakia|拉卡亚/.test(latin)) out.push('拉卡亚');
  if (/pukaki|普卡基/.test(latin)) out.push('普卡基');
  if (/unzoo|塔斯曼巡游|恶魔动物园/.test(latin)) out.push('unzoo', '亚瑟港', '鹰颈');
  if (/十二使徒|大洋路/.test(name)) out.push('十二使徒', '吉布森', '洛克阿德');
  if (/玩具博物馆|toy museum/.test(latin)) out.push('玩具博物馆');
  if (/天际线|luge/.test(latin)) out.push('天际线');
  if (/鲨鱼/.test(name)) out.push('鲨鱼');
  if (/几维/.test(name)) out.push('几维');
  if (/米尔福德|milford/.test(latin)) out.push('milford');
  if (/缆车/.test(name)) out.push('缆车');
  return out;
}

interface Needles {
  zh: string[];
  en: string[];
  crossZh: string[];
  crossEn: string[];
}

function isVisit(node: ItineraryNode): boolean {
  if (node.category === 'airport' || node.category === 'transit' || node.category === 'hotel') return false;
  if ((node.scene_group || '').includes('不必停留')) return false;
  const tips = (node.tips ?? []).join('\n');
  if (tips.includes('不停车') || tips.includes('不必停留') || tips.includes('只作参考')) return false;
  if (/^(开车满|回到|酒店出发|散团)/.test(node.name)) return false;
  return true;
}

function needlesFor(name: string, city: string): Needles {
  const zh = new Set<string>();
  const en = new Set<string>();
  const runs = name.match(/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/g) ?? [];
  const cityFold = fold(city);
  for (const run of runs) {
    const folded = fold(run);
    if (folded.length < 2 || folded === cityFold || WEAK.has(folded) || WEAK.has(run.toLowerCase())) continue;
    if (/[a-z]/.test(folded)) en.add(folded);
    else {
      zh.add(folded);
      if (folded.endsWith('湖') || folded.endsWith('峡湾')) {
        const stem = folded.replace(/(湖|峡湾)$/u, '');
        if (stem.length >= 2 && stem !== cityFold) zh.add(stem);
      }
    }
  }
  for (const extra of extraNeedles(name)) {
    const folded = fold(extra);
    if (folded.length < 2 || folded === cityFold) continue;
    if (/[a-z]/.test(folded)) en.add(folded);
    else zh.add(folded);
  }
  const crossZh = [...zh].filter((token) => !CROSS_BLOCK.has(token));
  const crossEn = [...en].filter((token) => !CROSS_BLOCK.has(token) && token.length >= 5);
  return { zh: [...zh], en: [...en], crossZh, crossEn };
}

function visitText(day: DayPlan): { folded: string; words: string } {
  const visits = day.nodes.filter(isVisit);
  return {
    folded: visits.map((node) => fold(node.name)).join('\n'),
    words: visits.map((node) => node.name.toLowerCase()).join('\n'),
  };
}

function textHits(text: { folded: string; words: string }, zh: string[], en: string[]): boolean {
  if (zh.some((token) => text.folded.includes(token))) return true;
  return en.some((token) => new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(text.words));
}

function groupRank(group: string): number {
  const index = HIGHLIGHT_GROUP_ORDER.indexOf(group as (typeof HIGHLIGHT_GROUP_ORDER)[number]);
  return index === -1 ? HIGHLIGHT_GROUP_ORDER.length : index;
}

function regionOf(day: DayPlan): string {
  return day.region?.trim() || '未分区';
}

function linkFor(region: string): { country: string; cities: string[]; note: string } {
  const known = REGION_LINKS[region];
  if (known) return { ...known, note: known.note ?? '' };
  const listed = HIGHLIGHT_CATALOG.some((item) => item.city === region);
  return {
    country: listed ? HIGHLIGHT_CATALOG.find((item) => item.city === region)?.country ?? '' : '',
    cities: listed ? [region] : [],
    note: listed ? '' : '亮点库没有这一区。',
  };
}

function markHighlight(item: CatalogHighlight, stayIndexes: Set<number>, days: DayPlan[]): HighlightMark {
  const needles = needlesFor(item.name, item.city);
  const here = days.some(
    (day, index) => stayIndexes.has(index) && textHits(visitText(day), needles.zh, needles.en),
  );
  if (here) return { status: 'in' };
  for (let index = 0; index < days.length; index += 1) {
    if (stayIndexes.has(index)) continue;
    if (!textHits(visitText(days[index]), needles.crossZh, needles.crossEn)) continue;
    const day = days[index];
    return {
      status: 'other',
      date: day.date,
      weekday: day.weekday,
      region: regionOf(day),
    };
  }
  return { status: 'out' };
}

export function formatZhDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[2])} 月 ${Number(match[3])} 日`;
}

export function buildTripDigest(days: DayPlan[]): TripDigest {
  const stays: DigestStay[] = [];
  let cursor = 0;
  while (cursor < days.length) {
    const region = regionOf(days[cursor]);
    let end = cursor + 1;
    while (end < days.length && regionOf(days[end]) === region) end += 1;
    const slice = days.slice(cursor, end);
    const indexes = new Set(slice.map((_, offset) => cursor + offset));
    const link = linkFor(region);
    const highlights = HIGHLIGHT_CATALOG.filter((item) => link.cities.includes(item.city))
      .map((item) => ({ ...item, mark: markHighlight(item, indexes, days) }))
      .sort((a, b) => groupRank(a.group) - groupRank(b.group));
    stays.push({
      region,
      country: link.country,
      note: link.note,
      days: slice.map((day, offset) => ({
        index: cursor + offset,
        dayNumber: day.day_index,
        date: day.date,
        weekday: day.weekday,
        label: day.label,
        region,
      })),
      highlights,
    });
    cursor = end;
  }

  const used = new Set(stays.flatMap((stay) => stay.highlights.map((item) => item.city)));
  const asideCities: TripDigest['asideCities'] = [];
  const seen = new Set<string>();
  if (used.size === 0) {
    return {
      dayCount: days.length,
      dateStart: days[0]?.date ?? '',
      dateEnd: days[days.length - 1]?.date ?? '',
      stays,
      asideCities,
    };
  }
  for (const item of HIGHLIGHT_CATALOG) {
    if (used.has(item.city) || seen.has(item.city)) continue;
    seen.add(item.city);
    const rows = HIGHLIGHT_CATALOG.filter((row) => row.city === item.city);
    const commented = rows.length > 0 && rows.every((row) => row.group === '已注释');
    asideCities.push({
      city: item.city,
      country: item.country,
      note: commented ? '清单里已注释，这趟没有排。' : '这趟没有排到。',
    });
  }

  return {
    dayCount: days.length,
    dateStart: days[0]?.date ?? '',
    dateEnd: days[days.length - 1]?.date ?? '',
    stays,
    asideCities,
  };
}
