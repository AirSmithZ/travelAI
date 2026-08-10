/** 与单程 ItineraryGraph / layoutNodes 一致的图布局常量 */
export const TRIP_NODE_WIDTH = 168;
export const TRIP_NODE_HEIGHT = 88;
export const TRIP_NODE_HEIGHT_DAGRE = 108;
export const TRIP_RANK_SEP = 100;
export const TRIP_NODE_SEP = 48;

export const COMPACT_NODE_WIDTH = 140;
export const COMPACT_NODE_HEIGHT = 64;
export const COMPACT_RANK_SEP = 80;

/**
 * 总览：相邻节点卡片边到边的最小左右净空（通勤标签通道）。
 * 须 ≥ OverviewBezierEdge 标签宽度上限（~120），按 8px 网格取整；
 * 与单程 dagre 的 TRIP_RANK_SEP 解耦，避免改总览间距牵动单日图。
 */
export const OVERVIEW_MIN_NODE_H_GAP = 136;
export const OVERVIEW_COMPACT_MIN_NODE_H_GAP = 112;

/** 在最小净空之上的额外呼吸间距（通常为 0；保底已由 MIN_NODE_H_GAP 承担） */
export const OVERVIEW_NODE_GAP = 0;
export const OVERVIEW_COMPACT_NODE_GAP = 0;
export const OVERVIEW_DRAG_ACTIVATION_PX = 8;
/** 节点中心越过区域行边界的滞回距离，避免边界抖动 */
export const OVERVIEW_REGION_CROSS_PX = 24;
/** 总览换区入场动画时长（ms），与 design-taste motion 一致 */
export const OVERVIEW_REGION_ENTER_MS = 280;
