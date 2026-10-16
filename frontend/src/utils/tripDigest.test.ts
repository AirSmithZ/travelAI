import assert from 'node:assert/strict';
import raw from '../data/anzTrip.json' with { type: 'json' };
import type { DayPlan } from '../types/itinerary';
import { buildTripDigest } from './tripDigest.ts';

const days = raw.itinerary.days as DayPlan[];
const digest = buildTripDigest(days);

assert.equal(digest.dayCount, 21);
assert.equal(digest.dateStart, '2027-02-09');
assert.equal(digest.dateEnd, '2027-03-01');
assert.deepEqual(
  digest.stays.map((stay) => stay.region),
  ['成都', '墨尔本', '霍巴特', '悉尼', '凯恩斯', '基督城', '费尔利', '瓦纳卡', '皇后镇'],
);
assert.deepEqual(
  digest.stays.map((stay) => stay.days.length),
  [1, 2, 3, 2, 4, 2, 2, 1, 4],
);

function marked(region: string, group: string, status: 'in' | 'other' | 'out'): string[] {
  const stay = digest.stays.find((item) => item.region === region);
  assert.ok(stay, region);
  return stay.highlights
    .filter((item) => item.group === group && item.mark.status === status)
    .map((item) => item.name);
}

const melbourneIn = marked('墨尔本', '已有', 'in').join('\n');
for (const name of ['维多利亚州立图书馆', '圣保罗大教堂', '皇家拱廊', '弗林德斯街火车站', '大洋路 / 十二使徒', 'palermo', 'Max on hardware']) {
  assert.ok(melbourneIn.includes(name), `墨尔本应写入 ${name}`);
}
assert.ok(marked('墨尔本', '已有', 'out').some((name) => name.includes('laneways')));

assert.ok(marked('霍巴特', '已有', 'in').some((name) => name.includes('萨拉曼卡')));
assert.ok(marked('霍巴特', '已有', 'in').some((name) => name.includes('圣戴维')));
assert.ok(marked('霍巴特', '已有', 'in').some((name) => name.includes('Unzoo')));
assert.ok(marked('霍巴特', '已有', 'in').some((name) => name.toLowerCase().includes('gelato')));
assert.ok(marked('霍巴特', '已有', 'out').some((name) => name.includes('玛丽亚岛')));

assert.ok(marked('悉尼', '已有', 'in').includes('悉尼歌剧院'));
assert.ok(marked('悉尼', '已有', 'in').some((name) => name.toLowerCase().includes('porteno')));

assert.ok(marked('凯恩斯', '已有', 'in').some((name) => name.includes('大堡礁')));
assert.ok(marked('凯恩斯', '已有', 'in').includes('帕罗尼拉公园'));
assert.ok(marked('凯恩斯', '已有', 'out').includes('跳伞'));

assert.ok(marked('基督城', '已有', 'in').some((name) => name.includes('植物园')));
assert.ok(marked('基督城', '已有', 'in').some((name) => name.toLowerCase().includes('westfield')));
assert.ok(marked('基督城', '已有', 'in').some((name) => name.toLowerCase().includes('riverside')));

const tekapoOut = marked('费尔利', '已有', 'out').join('\n');
assert.ok(tekapoOut.includes('库克山'));
assert.ok(tekapoOut.includes('极光'));
assert.ok(tekapoOut.includes('三文鱼'));
assert.ok(tekapoOut.includes('pukaki'));
assert.ok(marked('费尔利', '已有', 'in').some((name) => name.toLowerCase().includes('rakakia')));

const toy = digest.stays
  .find((stay) => stay.region === '瓦纳卡')
  ?.highlights.find((item) => item.name.includes('玩具博物馆'));
assert.equal(toy?.mark.status, 'other');
if (toy?.mark.status === 'other') assert.equal(toy.mark.date, '2027-02-26');
const arrow = digest.stays
  .find((stay) => stay.region === '瓦纳卡')
  ?.highlights.find((item) => item.name === '箭镇');
assert.equal(arrow?.mark.status, 'other');
if (arrow?.mark.status === 'other') assert.equal(arrow.mark.date, '2027-02-26');

assert.ok(marked('皇后镇', '已有', 'in').some((name) => name.includes('米尔福德')));
assert.ok(marked('皇后镇', '已有', 'in').includes('皇后镇公园'));
assert.ok(marked('皇后镇', '已有', 'out').includes('普卡基湖'));

assert.deepEqual(
  digest.asideCities.map((city) => city.city),
  ['奥克兰'],
);

console.log('tripDigest.test.ts ok');
