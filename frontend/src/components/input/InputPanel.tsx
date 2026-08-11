import { useEffect, useRef } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext, selectActiveItinerary } from '../../stores/usePlanStore';
import type { EditorTarget } from '../../stores/usePlanStore';
import { ChatPanel } from '../chat/ChatPanel';
import { EvidencePanel } from '../evidence/EvidencePanel';
import { FlightIntelPanel } from '../flight/FlightIntelPanel';
import { StayZonePanel } from '../stay/StayZonePanel';
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
  const plan = usePlanStore((s) => s.getActivePlan());
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
      const scrollEl = editorRef.current.querySelector<HTMLElement>('.itinerary-editor__scroll');
      if (scrollEl) scrollEl.scrollTop = 0;
    }
    prevNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    // doc 36 HOT-UX-01: keep stay editable after generate (replace hotel / search).
    // Flight panel may still close to avoid crowding; stay must remain reachable.
    if (plan.phase === 'detailed' && leftPanelMode === 'flight') {
      setLeftPanelMode('chat');
    }
  }, [plan.phase, leftPanelMode, setLeftPanelMode]);

  const evidenceItems = itinerary?.meta?.evidence ?? [];
  const evidenceCount = evidenceItems.length;
  const evidenceStatus = itinerary?.meta?.evidence_status;
  const showChat = leftPanelMode === 'chat';
  const showFlight = leftPanelMode === 'flight' && plan.phase !== 'detailed';
  const showStay = leftPanelMode === 'stay';
  const showEvidence = leftPanelMode === 'evidence';
  const showForm = leftPanelMode === 'form';
  /** Stay/evidence after generate (doc 36); flight entry stays pre-generate. */
  const showPhaseBFlightEntry = plan.phase !== 'detailed';
  const showPhaseBStayEntry = true;

  const purchaseUrl = plan.travel_intel.last_flight_search?.purchase_url;

  const formHeading = formEditorHeading(editorTarget, itinerary);
  const hasItineraryDays = Boolean(itinerary?.days?.length);
  /** UX-CHAT-04: 需求阶段以对话+摘要为主；有行程后才强调节点编辑 */
  const showNodeEditorStrip = showChat && hasItineraryDays;
  const nodeEditorHint = nodeName
    ? `当前：${nodeName}`
    : edgeLabel
      ? `连线：${edgeLabel}`
      : '选中节点后精修';

  const heading = nodeName
    ? `节点 · ${nodeName}`
    : edgeLabel
      ? `连线 · ${edgeLabel}`
      : formHeading ?? (hasItineraryDays ? '节点编辑' : '计划摘要见对话');

  const panelClass = showChat
    ? 'input-panel--chat'
    : showFlight
      ? 'input-panel--flight'
      : showStay
        ? 'input-panel--stay'
        : showEvidence
          ? 'input-panel--evidence'
          : 'input-panel--form';

  return (
    <aside className={`input-panel ${panelClass}`}>
      {showChat && (
        <ChatPanel
          onCollapse={() => {
            // UX-CHAT-04: 无行程时折叠不进空表单，仍留对话
            if (hasItineraryDays) setLeftPanelMode('form');
          }}
          selectedNodeName={nodeName}
        />
      )}

      {/* 机酒/印证/预览入口已收拢到对话区「计划摘要」枢纽；底栏仅保留生成后的节点编辑 */}
      {showNodeEditorStrip && (
        <button
          type="button"
          className="input-panel__form-strip"
          onClick={() => setLeftPanelMode('form')}
        >
          <span>节点编辑</span>
          <span className="input-panel__form-strip-hint">{nodeEditorHint}</span>
        </button>
      )}

      {showEvidence && (
        <>
          <div className="input-panel__flight-scroll">
            <EvidencePanel
              items={evidenceItems}
              poiCandidates={itinerary?.meta?.poi_candidates ?? []}
              status={evidenceStatus}
              onClose={() => setLeftPanelMode('chat')}
            />
          </div>
          <footer className="input-panel__flight-foot">
            <button
              type="button"
              className="input-panel__flight-btn"
              onClick={() => setLeftPanelMode('chat')}
            >
              返回对话
            </button>
            {hasItineraryDays && (
              <button
                type="button"
                className="input-panel__flight-btn input-panel__flight-btn--primary"
                onClick={() => setLeftPanelMode('form')}
              >
                节点编辑
              </button>
            )}
          </footer>
        </>
      )}

      {showFlight && (
        <>
          <div className="input-panel__flight-scroll">
            <FlightIntelPanel layout="full" />
          </div>
          <footer className="input-panel__flight-foot">
            <button
              type="button"
              className="input-panel__flight-btn"
              onClick={() => setLeftPanelMode('chat')}
            >
              返回对话
            </button>
            {purchaseUrl ? (
              <a
                href={purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="input-panel__flight-link"
              >
                Trip.com 预订
              </a>
            ) : (
              <span className="input-panel__flight-link input-panel__flight-link--muted">
                搜索后可预订
              </span>
            )}
            <button
              type="button"
              className="input-panel__flight-btn input-panel__flight-btn--primary"
              onClick={() => setLeftPanelMode('stay')}
            >
              继续 · 住宿片区
            </button>
          </footer>
        </>
      )}

      {showStay && (
        <>
          <div className="input-panel__flight-scroll">
            <StayZonePanel layout="full" />
          </div>
          <footer className="input-panel__flight-foot">
            {showPhaseBFlightEntry ? (
              <button
                type="button"
                className="input-panel__flight-btn"
                onClick={() => setLeftPanelMode('flight')}
              >
                航班确认
              </button>
            ) : (
              <button
                type="button"
                className="input-panel__flight-btn"
                onClick={() => setLeftPanelMode('chat')}
              >
                返回对话
              </button>
            )}
            {hasItineraryDays ? (
              <>
                {showPhaseBFlightEntry && (
                  <button
                    type="button"
                    className="input-panel__flight-btn"
                    onClick={() => setLeftPanelMode('chat')}
                  >
                    返回对话
                  </button>
                )}
                <button
                  type="button"
                  className="input-panel__flight-btn input-panel__flight-btn--primary"
                  onClick={() => setLeftPanelMode('form')}
                >
                  继续编辑行程
                </button>
              </>
            ) : (
              <button
                type="button"
                className="input-panel__flight-btn input-panel__flight-btn--primary"
                onClick={() => setLeftPanelMode('chat')}
              >
                继续编辑行程
              </button>
            )}
          </footer>
        </>
      )}

      {showForm && (
        <section ref={editorRef} className="input-panel__editor">
          <div className="input-panel__editor-head">
            <h2 className="input-panel__heading">{heading}</h2>
            <div className="input-panel__editor-actions">
              {showPhaseBFlightEntry && (
                <button
                  type="button"
                  className="input-panel__expand-chat"
                  onClick={() => setLeftPanelMode('flight')}
                >
                  航班确认
                </button>
              )}
              {showPhaseBStayEntry && (
                <button
                  type="button"
                  className="input-panel__expand-chat"
                  onClick={() => setLeftPanelMode('stay')}
                >
                  {hasItineraryDays ? '换酒店 / 住宿' : '住宿片区'}
                </button>
              )}
              {hasItineraryDays && (
                <button
                  type="button"
                  className="input-panel__expand-chat"
                  onClick={() => setLeftPanelMode('evidence')}
                >
                  {evidenceCount > 0 ? `参考依据 (${evidenceCount})` : '参考依据'}
                </button>
              )}
              <button
                type="button"
                className="input-panel__expand-chat"
                onClick={() => setLeftPanelMode('chat')}
              >
                展开对话
              </button>
            </div>
          </div>
          <ItineraryEditor />
        </section>
      )}
    </aside>
  );
}
