/** 与单程 ItineraryGraph / layoutNodes 一致的图布局常量 */
export const TRIP_NODE_WIDTH = 168;
export const TRIP_NODE_HEIGHT = 88;
export const TRIP_NODE_HEIGHT_DAGRE = 108;
export const TRIP_RANK_SEP = 100;
export const TRIP_NODE_SEP = 48;

export const COMPACT_NODE_WIDTH = 140;
export const COMPACT_NODE_HEIGHT = 64;
export const COMPACT_RANK_SEP = 80;

/** 总览单元格内节点水平间距（给连线留通道） */
export const OVERVIEW_NODE_GAP = 12;
export const OVERVIEW_COMPACT_NODE_GAP = 8;
export const OVERVIEW_DRAG_ACTIVATION_PX = 8;
/** 节点中心越过区域行边界的滞回距离，避免边界抖动 */
export const OVERVIEW_REGION_CROSS_PX = 24;
/** 总览换区入场动画时长（ms），与 design-taste motion 一致 */
export const OVERVIEW_REGION_ENTER_MS = 280;
