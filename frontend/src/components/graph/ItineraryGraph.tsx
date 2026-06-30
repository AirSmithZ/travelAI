import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import { formatWeatherBrief, formatWeatherSubline } from '../../utils/formatWeather';
import { layoutNodes } from '../../utils/layoutNodes';
import { buildSceneGroupNodes } from '../../utils/sceneGroups';
import { TripNode, type TripNodeData } from './TripNode';
import { SceneGroupNode } from './SceneGroupNode';
import { TripEdge, type TripEdgeData } from './TripEdge';
import './ItineraryGraph.css';

const nodeTypes = { tripNode: TripNode, sceneGroup: SceneGroupNode };
const edgeTypes = { tripEdge: TripEdge };

export function ItineraryGraph() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const selectedNodeId = usePlanStore((s) => s.selectedNodeId);
  const selectedEdgeId = usePlanStore((s) => s.selectedEdgeId);
  const selectNode = usePlanStore((s) => s.selectNode);
  const selectDay = usePlanStore((s) => s.selectDay);
  const selectEdge = usePlanStore((s) => s.selectEdge);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const updateNodePosition = usePlanStore((s) => s.updateNodePosition);
  const connectNodes = usePlanStore((s) => s.connectNodes);
  const addNode = usePlanStore((s) => s.addNode);

  const day = itinerary?.days[activeDayIndex];

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!day) return { flowNodes: [], flowEdges: [] };

    const positions = layoutNodes(day.nodes, day.edges);

    const tripNodes: Node<TripNodeData>[] = day.nodes.map((node, i) => ({
      id: node.id,
      type: 'tripNode',
      position: positions.get(node.id) ?? { x: i * 200, y: 80 },
      data: { node, selected: node.id === selectedNodeId },
      draggable: true,
      zIndex: 1,
    }));

    const groupNodes = buildSceneGroupNodes(day.nodes, positions);

    const flowNodes: Node[] = [...groupNodes, ...tripNodes];

    const flowEdges: Edge<TripEdgeData>[] = day.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'tripEdge',
      data: { edge },
      animated: edge.type === 'primary',
      selected: edge.id === selectedEdgeId,
    }));

    return { flowNodes, flowEdges };
  }, [day, selectedNodeId, selectedEdgeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onNodeDoubleClick = useCallback(() => {
    setActiveView('map');
  }, [setActiveView]);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (!day) return;
      updateNodePosition(activeDayIndex, node.id, node.position);
    },
    [day, activeDayIndex, updateNodePosition],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectNodes(activeDayIndex, connection.source, connection.target);
    },
    [activeDayIndex, connectNodes],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  if (!day) return null;

  return (
    <div className="itinerary-graph">
      <div
        className="itinerary-graph__lane-header"
        role="button"
        tabIndex={0}
        onClick={() => selectDay(activeDayIndex)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectDay(activeDayIndex);
          }
        }}
      >
        <span className="itinerary-graph__region">
          {day.region || `Day ${day.day_index}`}
        </span>
        <div className="itinerary-graph__lane-actions">
          <button
            type="button"
            className="itinerary-graph__add-btn"
            onClick={(e) => {
              e.stopPropagation();
              addNode(
                activeDayIndex,
                selectedNodeId ? { insertAfter: selectedNodeId } : { position: 'end' },
              );
            }}
          >
            {selectedNodeId ? '+ 在此后添加' : '+ 添加节点'}
          </button>
          {day.weather && (
            <span className="itinerary-graph__weather">
              {formatWeatherBrief(day.weather)}
              {` · ${formatWeatherSubline(day.weather)}`}
            </span>
          )}
        </div>
      </div>
      <div className="itinerary-graph__canvas" data-export-day-graph>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => {
            selectNode(null);
            selectEdge(null);
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable
          connectOnClick={false}
          edgesFocusable
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.4}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(148,163,184,0.08)"
          />
        </ReactFlow>
      </div>
      <div className="itinerary-graph__legend">
        <span className="itinerary-graph__legend-item">
          <i className="itinerary-graph__line itinerary-graph__line--solid" />
          主路线
        </span>
        <span className="itinerary-graph__legend-item">
          <i className="itinerary-graph__line itinerary-graph__line--dashed" />
          备选项
        </span>
        <span className="itinerary-graph__legend-item">
          <i className="itinerary-graph__box" />
          场景分组
        </span>
        <span className="itinerary-graph__hint">拖拽节点连线 · 点击连线编辑 · 双击节点查看地图</span>
      </div>
    </div>
  );
}
