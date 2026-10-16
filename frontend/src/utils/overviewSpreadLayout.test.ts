import assert from 'node:assert/strict';
import type { DayPlan, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import { estimateCommuteChipWidth, formatSpreadEdgeLabel, spreadEdgeCaption } from './commuteLabels';
import {
  computeCellLayout,
  estimateOverviewCardHeight,
  getOverviewMetrics,
} from './layoutOverview';

function edge(partial: Partial<ItineraryEdge> & Pick<ItineraryEdge, 'id' | 'from' | 'to'>): ItineraryEdge {
  return {
    type: 'primary',
    transport_mode: 'walk',
    duration_minutes: 0,
    ...partial,
  };
}

function node(partial: Partial<ItineraryNode> & Pick<ItineraryNode, 'id' | 'name'>): ItineraryNode {
  return {
    category: 'attraction',
    lat: 0,
    lng: 0,
    is_optional: false,
    ...partial,
  };
}

function day(nodes: ItineraryNode[], edges: ItineraryEdge[]): DayPlan {
  return {
    day_index: 1,
    date: '2027-02-14',
    weekday: '周日',
    label: '第 1 天',
    region: '霍巴特',
    nodes,
    edges,
  };
}

const metrics = getOverviewMetrics(8);

assert.equal(
  formatSpreadEdgeLabel(
    edge({
      id: 'e1',
      from: 'a',
      to: 'b',
      transport_mode: 'walk',
      duration_minutes: 3,
      distance_meters: 220,
      label: '步行，3 分钟，直线 0.22 公里',
    }),
  ),
  '220m · 3′',
);

assert.equal(
  formatSpreadEdgeLabel(
    edge({
      id: 'e2',
      from: 'a',
      to: 'b',
      transport_mode: 'bus',
      duration_minutes: 0,
      route_source: 'user_hint',
      label: '团车',
    }),
  ),
  '团车',
);

assert.equal(
  formatSpreadEdgeLabel(
    edge({
      id: 'e3',
      from: 'a',
      to: 'b',
      transport_mode: 'ferry',
      duration_minutes: 180,
      label: '船，约 2.5–3 小时',
    }),
  ),
  '船，约 2.5–3 小时',
);

const routeNodes = [
  node({ id: 'a', name: '酒店' }),
  node({ id: 'b', name: '码头' }),
];
const routeEdges = [
  edge({
    id: 'ab',
    from: 'a',
    to: 'b',
    transport_mode: 'bus',
    duration_minutes: 0,
    label: '团车',
  }),
];
const compactLayout = computeCellLayout(day(routeNodes, routeEdges), routeNodes, metrics);
const spreadLayout = computeCellLayout(day(routeNodes, routeEdges), routeNodes, metrics, {
  spread: true,
});
const compactGap =
  compactLayout.placements.get('b')!.x -
  (compactLayout.placements.get('a')!.x + compactLayout.placements.get('a')!.width);
assert.equal(compactGap, 4, 'default chain keeps the existing 4px block gap');
const spreadGap =
  spreadLayout.placements.get('b')!.x -
  (spreadLayout.placements.get('a')!.x + spreadLayout.placements.get('a')!.width);
const shortCaption = spreadEdgeCaption(routeEdges[0]);
assert.equal(spreadGap, estimateCommuteChipWidth(shortCaption) + 40);

const longEdge = edge({
  id: 'long',
  from: 'a',
  to: 'b',
  transport_mode: 'bus',
  duration_minutes: 30,
  label: 'SkyBus，平均 30 分钟',
});
const longLayout = computeCellLayout(
  day(routeNodes, [longEdge]),
  routeNodes,
  metrics,
  { spread: true },
);
const longGap =
  longLayout.placements.get('b')!.x -
  (longLayout.placements.get('a')!.x + longLayout.placements.get('a')!.width);
assert.ok(longGap > spreadGap, `longer label gap ${longGap} > short gap ${spreadGap}`);
assert.equal(longGap, estimateCommuteChipWidth(spreadEdgeCaption(longEdge)) + 40);

const waveNodes = ['a', 'b', 'c', 'd'].map((id, i) => node({ id, name: `站${i}` }));
const waveEdges = waveNodes.slice(0, -1).map((n, i) =>
  edge({
    id: `e${i}`,
    from: n.id,
    to: waveNodes[i + 1].id,
    duration_minutes: 4,
    distance_meters: 300,
  }),
);
const wave = computeCellLayout(day(waveNodes, waveEdges), waveNodes, metrics, { spread: true });
const ys = waveNodes.map((n) => wave.placements.get(n.id)!.y);
assert.ok(new Set(ys).size > 1, 'spread chain is not on one horizontal line');

const fuelA = node({
  id: 'f1',
  name: 'Allied Fuel，Orchard Road',
  category: 'landmark',
  scene_group: '加油站，不必停留',
  cost_label: '不必停留',
  overview_offset: { x: 40, y: 0 },
});
const fuelB = node({
  id: 'f2',
  name: 'NPD Yaldhurst',
  category: 'landmark',
  scene_group: '加油站，不必停留',
  cost_label: '不必停留',
});
const fuels = [fuelA, fuelB];
const stacked = computeCellLayout(day(fuels, []), fuels, metrics);
const opened = computeCellLayout(day(fuels, []), fuels, metrics, { spread: true });
const cardH = estimateOverviewCardHeight(fuelA, metrics);
assert.ok(cardH > metrics.nodeHeight, 'wrapped fuel name is taller than the compact slot');
const stackedStep = stacked.placements.get('f2')!.y - stacked.placements.get('f1')!.y;
const openedStep = opened.placements.get('f2')!.y - opened.placements.get('f1')!.y;
assert.equal(stackedStep, metrics.nodeHeight + 8);
assert.ok(openedStep >= cardH + 8, `opened step ${openedStep} clears the card`);
assert.equal(opened.placements.get('f1')!.x, stacked.placements.get('f1')!.x);
assert.equal(opened.placements.get('f1')!.height, cardH);

const gridFuels = Array.from({ length: 7 }, (_, index) =>
  node({
    id: `g${index}`,
    name: `Fuel ${index}`,
    category: 'landmark',
    scene_group: '加油站，不必停留',
    cost_label: '不必停留',
  }),
);
const gridClosed = computeCellLayout(day(gridFuels, []), gridFuels, metrics);
const gridOpen = computeCellLayout(day(gridFuels, []), gridFuels, metrics, { spread: true });
const closedXs = new Set(gridFuels.map((n) => gridClosed.placements.get(n.id)!.x));
assert.equal(closedXs.size, 1, 'closed fuel list stays one column');
const row0 = [0, 1, 2].map((i) => gridOpen.placements.get(`g${i}`)!);
const row1 = [3, 4].map((i) => gridOpen.placements.get(`g${i}`)!);
const row2 = [5, 6].map((i) => gridOpen.placements.get(`g${i}`)!);
assert.equal(new Set(row0.map((p) => p.y)).size, 1, 'first fuel row shares one y');
assert.ok(row0[1].x >= row0[0].x + row0[0].width, 'cards in a row do not overlap');
assert.ok(row1[0].y >= row0[0].y + row0[0].height, 'second row starts below the first');
assert.ok(row2[0].y >= row1[0].y + row1[0].height, 'third row starts below the second');
assert.equal(row1[0].x, row0[0].x, 'rows share a left edge');

const forkParent = node({ id: 'p', name: 'Palermo' });
const forkSide = node({ id: 'm', name: 'Max on Hardware', category: 'restaurant', is_optional: true });
const forkNext = node({ id: 'r', name: '回到酒店' });
const forkNodes = [forkParent, forkSide, forkNext];
const forkEdges = [
  edge({ id: 'pm', from: 'p', to: 'm', duration_minutes: 1, label: '两家之间步行 1 分钟' }),
  edge({
    id: 'pr',
    from: 'p',
    to: 'r',
    duration_minutes: 6,
    distance_meters: 530,
    label: '步行，6 分钟，直线 0.53 公里',
  }),
];
const fork = computeCellLayout(day(forkNodes, forkEdges), forkNodes, metrics, { spread: true });
const parentP = fork.placements.get('p')!;
const sideP = fork.placements.get('m')!;
const nextP = fork.placements.get('r')!;
assert.equal(sideP.x, parentP.x, 'fork sits under its parent, not on the spine');
const forkLane = sideP.y - (parentP.y + parentP.height);
assert.ok(forkLane >= 48, `fork label lane ${forkLane} clears both cards`);
assert.ok(nextP.x >= parentP.x + parentP.width + 40, 'spine continues to the right of the parent');
assert.ok(
  nextP.x >= sideP.x + sideP.width,
  'spine node does not overlap the fork card',
);

console.log('overviewSpreadLayout.test.ts ok');
