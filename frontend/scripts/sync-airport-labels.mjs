#!/usr/bin/env node
/**
 * B-FLT-06: merge backend city_codes.json into airportLabels.ts
 * Preserves hand-tuned AIRPORT_LABELS for multi-airport cities; adds missing codes/aliases.
 *
 * Usage: node scripts/sync-airport-labels.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cityCodesPath = path.resolve(
  root,
  '../backend/app/services/flight/data/city_codes.json',
);
const labelsPath = path.join(root, 'src/data/airportLabels.ts');

const cityCodes = JSON.parse(fs.readFileSync(cityCodesPath, 'utf8'));
const existing = fs.readFileSync(labelsPath, 'utf8');

/** Prefer specific airport names already in file; city label as fallback for bare IATA */
const HAND_LABELS = {
  PVG: '浦东',
  SHA: '虹桥',
  PEK: '首都',
  PKX: '大兴',
  NRT: '成田',
  HND: '羽田',
  KIX: '关西',
  ITM: '伊丹',
  ICN: '仁川',
  GMP: '金浦',
  DMK: '曼谷廊曼',
  LHR: '希思罗',
  LGW: '盖特威克',
  CDG: '戴高乐',
  JFK: '肯尼迪',
  EWR: '纽瓦克',
  TFU: '天府',
};

const labels = { ...HAND_LABELS };
const aliases = {};

for (const [, entry] of Object.entries(cityCodes)) {
  const cityLabel = entry.label;
  const aliasList = entry.aliases || [];
  const iatas = aliasList.filter((a) => /^[A-Za-z]{3}$/.test(a)).map((a) => a.toUpperCase());
  for (const code of iatas) {
    if (!labels[code]) labels[code] = cityLabel;
  }
  // city-level default: first IATA
  const primary = iatas[0];
  if (primary) {
    for (const a of aliasList) {
      if (/^[A-Za-z]{3}$/.test(a)) {
        aliases[a.toLowerCase()] = a.toUpperCase();
      } else if (typeof a === 'string' && a.trim()) {
        aliases[a.trim()] = primary;
      }
    }
  }
}

// Keep common city→preferred airport overrides
Object.assign(aliases, {
  上海: 'PVG',
  浦东: 'PVG',
  虹桥: 'SHA',
  北京: 'PEK',
  首都: 'PEK',
  大兴: 'PKX',
  东京: 'NRT',
  成田: 'NRT',
  羽田: 'HND',
  大阪: 'KIX',
  关西: 'KIX',
  首尔: 'ICN',
  仁川: 'ICN',
  曼谷: 'BKK',
  伦敦: 'LHR',
  巴黎: 'CDG',
  纽约: 'JFK',
  tyo: 'NRT',
  sel: 'ICN',
  lon: 'LHR',
  par: 'CDG',
  nyc: 'JFK',
});

const labelLines = Object.entries(labels)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
  .join('\n');

const aliasLines = Object.entries(aliases)
  .sort(([a], [b]) => a.localeCompare(b, 'zh'))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');

const out = `/**
 * 机场 IATA → 中文展示名；别名 → IATA（与 backend city_codes.json 对齐并扩展经停常见码）。
 * 展示 fallback：未知码原样大写。
 * 由 \`npm run sync:airport-labels\`（B-FLT-06）从 city_codes.json 同步生成；手写多机场优先名见脚本 HAND_LABELS。
 */

/** 机场三字码 → 中文（优先具体机场名，同城多机场区分） */
export const AIRPORT_LABELS: Record<string, string> = {
${labelLines}
};

/** 用户输入别名 → IATA（小写 key） */
export const AIRPORT_ALIASES: Record<string, string> = {
${aliasLines}
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
  return \`\${formatAirportLabel(origin)}→\${formatAirportLabel(dest)}\`;
}
`;

fs.writeFileSync(labelsPath, out);
console.log(
  `sync-airport-labels: wrote ${Object.keys(labels).length} labels, ${Object.keys(aliases).length} aliases → ${path.relative(root, labelsPath)}`,
);
// touch check: file still parses helpers from existing if script broke
if (!existing.includes('resolveAirportCode')) {
  console.warn('warning: previous file missing helpers (unexpected)');
}
