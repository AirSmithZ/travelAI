import type { FormLayoutState } from '../types/travelPlan';

/** 行程编辑器仅含节点编辑块；规划字段由对话 + LLM patch 写入 */
export const DEFAULT_FORM_LAYOUT: FormLayoutState = {
  version: 1,
  blocks: [{ id: 'node_editor', visible: true, collapsed: false, order: 0 }],
};
