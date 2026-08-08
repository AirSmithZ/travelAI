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

/** 区域底色：对应 --region-tint-* 10% on --bg-base（暗色导出） */
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

/** OV-02: 浅底高对比导出主题 */
export const REGION_EXPORT_CELL_BG_LIGHT = [
  '#eef4f8',
  '#f5f2e8',
  '#eef6f1',
] as const;

export const REGION_EXPORT_RAIL_BG_LIGHT = [
  'hsl(205 35% 92%)',
  'hsl(42 40% 92%)',
  'hsl(155 30% 92%)',
] as const;

export const EXPORT_SHELL_LIGHT = {
  headerBg: 'rgba(248, 250, 252, 0.98)',
  railBg: 'rgba(248, 250, 252, 0.98)',
  cellNoteBg: 'rgba(241, 245, 249, 0.95)',
  border: 'rgba(51, 65, 85, 0.18)',
} as const;

export const OVERVIEW_EDGE_STROKE_LIGHT = {
  default: '#2563a8',
  alt: 'rgba(51, 65, 85, 0.65)',
  region: 'rgba(30, 64, 100, 0.75)',
} as const;

export const OVERVIEW_EDGE_LABEL_LIGHT = {
  fill: 'rgba(248, 250, 252, 0.95)',
  stroke: 'rgba(51, 65, 85, 0.2)',
  text: '#334155',
} as const;
