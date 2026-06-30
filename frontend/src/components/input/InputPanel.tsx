import { useEffect, useRef } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext, selectActiveItinerary } from '../../stores/usePlanStore';
import type { EditorTarget } from '../../stores/usePlanStore';
import { ChatPanel } from '../chat/ChatPanel';
import { ItineraryEditor } from './ItineraryEditor';
import './InputPanel.css';

function formEditorHeading(
  editorTarget: EditorTarget | null,
  itinerary: ReturnType<typeof selectActiveItinerary>,
): string | null {
  if (!editorTarget || editorTarget.kind !== 'form') return null;
  if (editorTarget.focus === 'region') {
    return `编辑 · 区域 · ${editorTarget.regionName}`;
  }
  if (itinerary) {
    const day = itinerary.days[editorTarget.dayIndex];
    return `编辑 · Day ${day?.day_index ?? editorTarget.dayIndex + 1}`;
  }
  return '当日概况';
}

export function InputPanel() {
  const selectedNodeId = usePlanStore((s) => s.selectedNodeId);
  const selectedEdgeId = usePlanStore((s) => s.selectedEdgeId);
  const editorTarget = usePlanStore((s) => s.editorTarget);
  const itinerary = usePlanStore(selectActiveItinerary);
  const leftPanelMode = usePlanStore((s) => s.leftPanelMode);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const editorRef = useRef<HTMLElement>(null);
  const prevNodeIdRef = useRef<string | null>(null);

  const nodeName =
    selectedNodeId && itinerary
      ? findNodeContext(itinerary, selectedNodeId)?.node.name
      : null;

  const edgeLabel =
    selectedEdgeId && itinerary && !selectedNodeId
      ? (() => {
          const ctx = findEdgeContext(itinerary, selectedEdgeId);
          if (!ctx) return null;
          const from = findNodeContext(itinerary, ctx.edge.from)?.node.name ?? ctx.edge.from;
          const to = findNodeContext(itinerary, ctx.edge.to)?.node.name ?? ctx.edge.to;
          return `${from} → ${to}`;
        })()
      : null;

  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevNodeIdRef.current && editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const showChat = leftPanelMode === 'chat';
  const showForm = leftPanelMode === 'form';

  const formHeading = formEditorHeading(editorTarget, itinerary);

  const heading = nodeName
    ? `编辑 · ${nodeName}`
    : edgeLabel
      ? `连线 · ${edgeLabel}`
      : formHeading ?? '当日概况';

  return (
    <aside
      className={`input-panel ${showChat ? 'input-panel--chat' : 'input-panel--form'}`}
    >
      {showChat && (
        <ChatPanel
          onCollapse={() => setLeftPanelMode('form')}
          selectedNodeName={nodeName}
        />
      )}

      {showChat && (
        <button
          type="button"
          className="input-panel__form-strip"
          onClick={() => setLeftPanelMode('form')}
        >
          <span>行程编辑</span>
          <span className="input-panel__form-strip-hint">点击展开表单</span>
        </button>
      )}

      {showForm && (
        <section ref={editorRef} className="input-panel__editor">
          <div className="input-panel__editor-head">
            <h2 className="input-panel__heading">{heading}</h2>
            <button
              type="button"
              className="input-panel__expand-chat"
              onClick={() => setLeftPanelMode('chat')}
            >
              展开对话
            </button>
          </div>
          <ItineraryEditor />
        </section>
      )}
    </aside>
  );
}
