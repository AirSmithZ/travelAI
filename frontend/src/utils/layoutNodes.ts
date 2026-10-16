import dagre from 'dagre';
import type { ItineraryEdge, ItineraryNode } from '../types/itinerary';
import {
  TRIP_NODE_HEIGHT_DAGRE,
  TRIP_NODE_WIDTH,
  TRIP_NODE_SEP,
  TRIP_RANK_SEP,
} from './graphLayoutConstants';

const NODE_WIDTH = TRIP_NODE_WIDTH;
const NODE_HEIGHT = TRIP_NODE_HEIGHT_DAGRE;

function isFuelListing(node: ItineraryNode): boolean {
  return Boolean(node.scene_group?.startsWith('加油站'));
}

export function layoutNodes(
  nodes: ItineraryNode[],
  edges: ItineraryEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: TRIP_NODE_SEP, ranksep: TRIP_RANK_SEP, marginx: 40, marginy: 60 });

  nodes.forEach((node) => {
    if (isFuelListing(node) && !node.position) return;
    const pos = node.position;
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: node.is_optional ? NODE_HEIGHT + 20 : NODE_HEIGHT,
    });
    if (pos) {
      g.setNode(node.id, {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        x: pos.x,
        y: pos.y,
      });
    }
  });

  edges
    .filter((e) => e.type === 'primary')
    .forEach((edge) => {
      if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
        g.setEdge(edge.from, edge.to);
      }
    });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    if (node.position) {
      positions.set(node.id, node.position);
      return;
    }
    const n = g.node(node.id);
    if (n) {
      positions.set(node.id, {
        x: n.x - NODE_WIDTH / 2,
        y: n.y - NODE_HEIGHT / 2,
      });
    }
  });

  // Stack optional nodes below their parent
  edges
    .filter((e) => e.type === 'alternative')
    .forEach((edge) => {
      const parent = positions.get(edge.from);
      const optNode = nodes.find((n) => n.id === edge.to);
      if (parent && optNode && !optNode.position) {
        const siblings = edges.filter(
          (e) => e.type === 'alternative' && e.from === edge.from,
        );
        const idx = siblings.findIndex((e) => e.to === edge.to);
        positions.set(edge.to, {
          x: parent.x,
          y: parent.y + NODE_HEIGHT + 24 + idx * (NODE_HEIGHT * 0.7),
        });
      }
    });

  const fuels = nodes.filter((node) => isFuelListing(node) && !node.position);
  if (fuels.length > 0) {
    let minX = 40;
    let maxY = 40;
    let any = false;
    for (const node of nodes) {
      if (isFuelListing(node)) continue;
      const pos = positions.get(node.id);
      if (!pos) continue;
      any = true;
      minX = Math.min(minX, pos.x);
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
    }
    const cols = 4;
    fuels.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions.set(node.id, {
        x: (any ? minX : 40) + col * (NODE_WIDTH + 24),
        y: (any ? maxY : 40) + 56 + row * (NODE_HEIGHT + 28),
      });
    });
  }

  return positions;
}

export { NODE_WIDTH, NODE_HEIGHT };
