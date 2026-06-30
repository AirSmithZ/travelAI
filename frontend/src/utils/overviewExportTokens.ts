/** html-to-image 不还原 color-mix / SVG 外部样式，导出用实色 */

export const OVERVIEW_EDGE_STROKE = {
  default: '#6b9cc4',
  alt: 'rgba(92, 109, 130, 0.75)',
  region: 'rgba(92, 109, 130, 0.85)',
} as const;

export const OVERVIEW_EDGE_LABEL = {
  fill: 'rgba(19, 27, 36, 0.92)',
  stroke: 'rgba(148, 163, 184, 0.18)',
  text: '#5c6d82',
} as const;

/** 区域底色：对应 --region-tint-* 10% on --bg-base */
export const REGION_EXPORT_CELL_BG = [
  '#101a22',
  '#141810',
  '#101814',
] as const;

export const REGION_EXPORT_RAIL_BG = [
  'hsl(205 45% 18%)',
  'hsl(42 40% 16%)',
  'hsl(155 35% 15%)',
] as const;

export const EXPORT_SHELL = {
  headerBg: 'rgba(19, 27, 36, 0.97)',
  railBg: 'rgba(19, 27, 36, 0.97)',
  cellNoteBg: 'rgba(19, 27, 36, 0.82)',
  border: 'rgba(148, 163, 184, 0.12)',
} as const;
