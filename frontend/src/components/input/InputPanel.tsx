import { useEffect, useRef } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext, selectActiveItinerary } from '../../stores/usePlanStore';
import { getFlightIntelPanelPhase } from '../../types/travelIntel';
import { getStayZonePanelPhase, stayZonePanelBadgeLabel } from '../../types/stayZone';
import type { EditorTarget } from '../../stores/usePlanStore';
import { ChatPanel } from '../chat/ChatPanel';
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
    if (plan.phase === 'detailed' && (leftPanelMode === 'flight' || leftPanelMode === 'stay')) {
      setLeftPanelMode('chat');
    }
  }, [plan.phase, leftPanelMode, setLeftPanelMode]);

  const showChat = leftPanelMode === 'chat';
  const showFlight = leftPanelMode === 'flight' && plan.phase !== 'detailed';
  const showStay = leftPanelMode === 'stay' && plan.phase !== 'detailed';
  const showForm = leftPanelMode === 'form';
  const showPhaseBEntry = plan.phase !== 'detailed';

  const purchaseUrl = plan.travel_intel.last_flight_search?.purchase_url;
  const flightPanelPhase = getFlightIntelPanelPhase(plan.travel_intel);
  const stayPanelPhase = getStayZonePanelPhase(plan.travel_intel);
  const stayBadge = stayZonePanelBadgeLabel(stayPanelPhase);

  const formHeading = formEditorHeading(editorTarget, itinerary);

  const heading = nodeName
    ? `编辑 · ${nodeName}`
    : edgeLabel
      ? `连线 · ${edgeLabel}`
      : formHeading ?? '当日概况';

  const panelClass = showChat
    ? 'input-panel--chat'
    : showFlight
      ? 'input-panel--flight'
      : showStay
        ? 'input-panel--stay'
        : 'input-panel--form';

  return (
    <aside className={`input-panel ${panelClass}`}>
      {showChat && (
        <ChatPanel
          onCollapse={() => setLeftPanelMode('form')}
          selectedNodeName={nodeName}
        />
      )}

      {showChat && showPhaseBEntry && (
        <button
          type="button"
          className="input-panel__form-strip input-panel__form-strip--flight"
          onClick={() => setLeftPanelMode('flight')}
        >
          <span>航班确认</span>
          <span className="input-panel__form-strip-hint">
            {flightPanelPhase === 'done' ? '已完成 · 点击查看' : '查价与确认航段'}
          </span>
        </button>
      )}

      {showChat && showPhaseBEntry && (
        <button
          type="button"
          className="input-panel__form-strip input-panel__form-strip--stay"
          onClick={() => setLeftPanelMode('stay')}
        >
          <span>住宿片区</span>
          <span className="input-panel__form-strip-hint">
            {stayPanelPhase === 'done' ? '已完成 · 点击查看' : stayBadge === '待确认' ? '待确认片区' : '推荐适合居住的区域'}
          </span>
        </button>
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
            <button
              type="button"
              className="input-panel__flight-btn"
              onClick={() => setLeftPanelMode('chat')}
            >
              返回对话
            </button>
            <button
              type="button"
              className="input-panel__flight-btn"
              onClick={() => setLeftPanelMode('flight')}
            >
              航班确认
            </button>
            <button
              type="button"
              className="input-panel__flight-btn input-panel__flight-btn--primary"
              onClick={() => setLeftPanelMode('form')}
            >
              继续编辑行程
            </button>
          </footer>
        </>
      )}

      {showForm && (
        <section ref={editorRef} className="input-panel__editor">
          <div className="input-panel__editor-head">
            <h2 className="input-panel__heading">{heading}</h2>
            <div className="input-panel__editor-actions">
              {showPhaseBEntry && (
                <button
                  type="button"
                  className="input-panel__expand-chat"
                  onClick={() => setLeftPanelMode('flight')}
                >
                  航班确认
                </button>
              )}
              {showPhaseBEntry && (
                <button
                  type="button"
                  className="input-panel__expand-chat"
                  onClick={() => setLeftPanelMode('stay')}
                >
                  住宿片区
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
