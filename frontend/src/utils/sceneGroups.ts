import type { Node } from '@xyflow/react';
import type { ItineraryNode } from '../types/itinerary';
import { NODE_HEIGHT, NODE_WIDTH } from './layoutNodes';

const PAD_X = 20;
const PAD_TOP = 28;
const PAD_BOTTOM = 16;

function nodeHeight(node: ItineraryNode): number {
  return node.is_optional ? NODE_HEIGHT + 20 : NODE_HEIGHT;
}

function slugGroup(label: string): string {
  return label.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '');
}

export function collectSceneGroupPresets(nodes: ItineraryNode[]): string[] {
  const set = new Set<string>();
  for (const node of nodes) {
    const g = node.scene_group?.trim();
    if (g) set.add(g);
  }
  return [...set];
}

/** 根据节点坐标生成路线图虚线分组框（React Flow group 节点） */
export function buildSceneGroupNodes(
  nodes: ItineraryNode[],
  positions: Map<string, { x: number; y: number }>,
): Node<{ label: string }>[] {
  const byGroup = new Map<string, ItineraryNode[]>();

  nodes.forEach((node) => {
    const label = node.scene_group?.trim();
    if (!label) return;
    const list = byGroup.get(label) ?? [];
    list.push(node);
    byGroup.set(label, list);
  });

  const result: Node<{ label: string }>[] = [];

  for (const [label, members] of byGroup) {
    if (members.length < 2) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasPos = false;

    for (const member of members) {
      const pos = positions.get(member.id);
      if (!pos) continue;
      hasPos = true;
      const h = nodeHeight(member);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + NODE_WIDTH);
      maxY = Math.max(maxY, pos.y + h);
    }

    if (!hasPos) continue;

    result.push({
      id: `scene-group-${slugGroup(label)}`,
      type: 'sceneGroup',
      position: { x: minX - PAD_X, y: minY - PAD_TOP },
      data: { label },
      style: {
        width: maxX - minX + PAD_X * 2,
        height: maxY - minY + PAD_TOP + PAD_BOTTOM,
      },
      selectable: false,
      draggable: false,
      focusable: false,
      connectable: false,
      zIndex: -1,
    });
  }

  return result;
}
