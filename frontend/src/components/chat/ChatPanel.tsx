import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseChatMessage,
  parseChatMessageStream,
  ChatApiError,
  fetchHealth,
  shouldUseDemoFallback,
  formatDroppedPatchNotice,
} from '../../api/chat';
import { usePlanStore, findNodeContext, findEdgeContext } from '../../stores/usePlanStore';
import { useToastStore } from '../../stores/useToastStore';
import { chatHistoryForParse } from '../../utils/chatHelpers';
import { dedupeConflictingPatches } from '../../utils/patchDedupe';
import { isGenerateIntent } from '../../utils/generateIntent';
import {
  derivePlanReadiness,
  formatReadinessAssistantText,
} from '../../utils/planReadiness';
import { splitLowRiskPatches } from '../../utils/lowRiskPatches';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer';
import { ChatStatusBar } from './ChatStatusBar';
import { PatchConfirmPanel } from './PatchConfirmPanel';
import { PlanSummaryCard } from './PlanSummaryCard';
import { ReadinessChecklist } from './ReadinessChecklist';
import { PatchUndoBar } from './PatchUndoBar';
import { getChatModeLabel, parseDemoChat } from './chatDemo';
import { executeChatToolCalls } from './executeChatToolCalls';
import {
  createParseActivity,
  formatActivitySummary,
  patchActivityStep,
} from '../../types/chatActivity';
import type { ChatMode, ChatParseSelection, FormPatch } from '../../types/travelPlan';
import './Chat.css';

function resolveChatMode(phase: string, lastMode?: ChatMode): 'global' | 'supplement' {
  if (lastMode) return lastMode;
  return phase === 'detailed' ? 'supplement' : 'global';
}

type ApiStatus = 'checking' | 'online' | 'llm_unconfigured' | 'offline' | 'fallback';

interface ChatPanelProps {
  onCollapse?: () => void;
  selectedNodeName?: string | null;
}

function buildSelection(state: ReturnType<typeof usePlanStore.getState>): ChatParseSelection | undefined {
  const itinerary = state.getItinerary();
  if (!itinerary) return undefined;

  let dayIndex = state.activeDayIndex + 1;
  const selection: ChatParseSelection = { day_index: dayIndex };

  if (state.selectedNodeId) {
    selection.node_id = state.selectedNodeId;
    const ctx = findNodeContext(itinerary, state.selectedNodeId);
    if (ctx) {
      selection.node_name = ctx.node.name;
      dayIndex = ctx.dayIndex + 1;
      selection.day_index = dayIndex;
    }
  }
  if (state.selectedEdgeId) {
    selection.edge_id = state.selectedEdgeId;
    const edgeCtx = findEdgeContext(itinerary, state.selectedEdgeId);
    if (edgeCtx?.scope === 'day') selection.day_index = edgeCtx.dayIndex + 1;
  }
  return selection;
}

function applyPatchesWithLowRiskAuto(patches: FormPatch[]): {
  autoCount: number;
  confirmCount: number;
} {
  const store = usePlanStore.getState();
  const plan = store.getActivePlan();
  const hasItinerary = Boolean(plan.itinerary?.days?.length);
  const { auto, confirm } = splitLowRiskPatches(patches, { hasItinerary });
  if (auto.length > 0) {
    store.setPatchUndoSnapshot({
      trip_request: structuredClone(plan.trip_request),
      itinerary: plan.itinerary ? structuredClone(plan.itinerary) : null,
      appliedIds: auto.map((p) => p.id),
      count: auto.length,
      expiresAt: Date.now() + 8_000,
    });
    store.confirmPatches(auto);
  }
  if (confirm.length > 0) {
    store.addPendingPatches(confirm);
  }
  return { autoCount: auto.length, confirmCount: confirm.length };
}

export function ChatPanel({ onCollapse, selectedNodeName }: ChatPanelProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const addChatMessage = usePlanStore((s) => s.addChatMessage);
  const setLastChatMode = usePlanStore((s) => s.setLastChatMode);
  const isGeneratingItinerary = usePlanStore((s) => s.isGeneratingItinerary);
  const generationProgress = usePlanStore((s) => s.generationProgress);
  const chatActivity = usePlanStore((s) => s.chatActivity);
  const setChatActivity = usePlanStore((s) => s.setChatActivity);
  const updateChatActivity = usePlanStore((s) => s.updateChatActivity);
  const pendingReadinessPrompt = usePlanStore((s) => s.pendingReadinessPrompt);
  const consumeReadinessPrompt = usePlanStore((s) => s.consumeReadinessPrompt);
  const showToast = useToastStore((s) => s.show);
  const [input, setInput] = useState('');
  const composerRef = useRef<ChatComposerHandle>(null);
  const [isLoading, setIsLoading] = useState(false);

  const prefillComposer = useCallback((text: string) => {
    const next = (text || '').trim();
    if (!next) return;
    setInput(next);
    // Next paint: focus so user sees the filled draft
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);
  const [streamingHint, setStreamingHint] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [showReadiness, setShowReadiness] = useState(false);

  const modeLabel = getChatModeLabel(plan.phase);
  const emptyHint =
    plan.phase === 'detailed'
      ? '行程已生成：直接说要改的点，例如「第二天晚一点出发」。换目的地请说「改去曼谷」（将新建计划）。'
      : '用一句话说清需求，例如「上海出发去新加坡 4 天，偏美食」。目的地与日期会自动写入；确认航班与住宿后，再点生成玩法。';

  const openReadiness = useCallback(() => {
    const readiness = derivePlanReadiness(usePlanStore.getState().getActivePlan());
    addChatMessage('assistant', formatReadinessAssistantText(readiness));
    setShowReadiness(true);
  }, [addChatMessage]);

  useEffect(() => {
    if (!pendingReadinessPrompt) return;
    consumeReadinessPrompt();
    openReadiness();
  }, [pendingReadinessPrompt, consumeReadinessPrompt, openReadiness]);

  const checkHealth = useCallback(async () => {
    const data = await fetchHealth();
    if (!data) {
      setApiStatus('offline');
      return;
    }
    if (!data.llm_configured) {
      setApiStatus('llm_unconfigured');
      return;
    }
    setApiStatus('online');
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (!isLoading || streamingHint) return;
    const timer = window.setTimeout(() => {
      setStreamingHint((prev) => prev || '仍在解析，请稍候…');
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [isLoading, streamingHint]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || isGeneratingItinerary) return;
    if (apiStatus === 'offline' || apiStatus === 'checking') return;

    const storeState = usePlanStore.getState();
    const activePlan = storeState.getActivePlan();
    const chatModeNow = resolveChatMode(activePlan.phase, activePlan.last_chat_mode);

    addChatMessage('user', text, { chat_mode: chatModeNow });
    setInput('');

    // UX-CHAT-02: generate intent → checklist, skip parse
    if (isGenerateIntent(text)) {
      openReadiness();
      return;
    }

    setIsLoading(true);
    setStreamingHint('');
    const parseStartedAt = Date.now();
    setChatActivity(createParseActivity());

    const afterUser = usePlanStore.getState().getActivePlan();

    const settleParseActivity = (error?: string) => {
      const session = usePlanStore.getState().chatActivity;
      if (!session || session.op !== 'parse') {
        setChatActivity(null);
        return;
      }
      let next = error ? { ...session, error } : session;
      next = {
        ...next,
        steps: next.steps.map((step) => {
          if (step.status === 'pending' || step.status === 'running') {
            return {
              ...step,
              status: error ? ('error' as const) : ('done' as const),
            };
          }
          return step;
        }),
      };
      addChatMessage('assistant', formatActivitySummary(next, Date.now() - parseStartedAt), {
        chat_mode: chatModeNow,
      });
      setChatActivity(null);
    };

    try {
      const useStream = apiStatus === 'online' || apiStatus === 'llm_unconfigured';
      const result = useStream
        ? await parseChatMessageStream(
            {
              message: text,
              chat_mode: chatModeNow,
              plan_phase: afterUser.phase,
              plan_id: afterUser.id,
              trip_request: afterUser.trip_request,
              itinerary: afterUser.itinerary,
              chat_history: chatHistoryForParse(afterUser.chat_messages),
              selection: buildSelection(usePlanStore.getState()),
            },
            {
              onDelta: (preview) => {
                setStreamingHint(preview);
                updateChatActivity((prev) =>
                  patchActivityStep(prev, 'parse_llm', { status: 'running' }),
                );
              },
              onValidating: () => {
                setStreamingHint((prev) => prev || '正在校验解析结果…');
                updateChatActivity((prev) =>
                  patchActivityStep(
                    patchActivityStep(prev, 'parse_llm', { status: 'done' }),
                    'parse_validate',
                    { status: 'running' },
                  ),
                );
              },
              onReasoning: (text) => {
                updateChatActivity((prev) => ({ ...prev, reasoning: text }));
              },
            },
          )
        : await parseChatMessage({
            message: text,
            chat_mode: chatModeNow,
            plan_phase: afterUser.phase,
            plan_id: afterUser.id,
            trip_request: afterUser.trip_request,
            itinerary: afterUser.itinerary,
            chat_history: chatHistoryForParse(afterUser.chat_messages),
            selection: buildSelection(usePlanStore.getState()),
          });
      setApiStatus('online');
      setStreamingHint(null);
      updateChatActivity((prev) =>
        patchActivityStep(
          patchActivityStep(prev, 'parse_llm', { status: 'done' }),
          'parse_validate',
          { status: 'done' },
        ),
      );
      settleParseActivity();

      if (result.chat_mode_used) {
        setLastChatMode(result.chat_mode_used);
      }

      const droppedNote =
        (result.dropped_patch_count ?? 0) > 0
          ? formatDroppedPatchNotice(result.dropped_patch_count ?? 0, result.warnings)
          : '';

      const { patches, conflictFields } = dedupeConflictingPatches(result.patches);
      addChatMessage('assistant', result.reply, {
        chat_mode: result.chat_mode_used ?? chatModeNow,
        ...(patches.length > 0 ? { patches, patch_status: 'pending' as const } : {}),
      });

      const toolResult = await executeChatToolCalls(result.tool_calls);

      if (patches.length > 0) {
        const { autoCount, confirmCount } = applyPatchesWithLowRiskAuto(patches);
        const conflictNote =
          conflictFields.length > 0
            ? `（同字段 ${conflictFields.join('、')} 已保留最新解析）`
            : '';
        const warnNote =
          result.warnings && result.warnings.length > 0 && !droppedNote
            ? ` ${result.warnings[0]}`
            : droppedNote
              ? ` ${droppedNote}`
              : '';
        if (autoCount > 0 && confirmCount === 0) {
          showToast(`已写入 ${autoCount} 项（可撤销）${conflictNote}${warnNote}`, 'info');
        } else if (autoCount > 0) {
          showToast(
            `已写入 ${autoCount} 项；另有 ${confirmCount} 项待确认${conflictNote}${warnNote}`,
          );
        } else {
          showToast(
            `已解析 ${confirmCount} 项修改，请在下方确认${conflictNote}${warnNote}`,
          );
        }
      } else if (toolResult.searched) {
        if (toolResult.found > 0) {
          showToast(`已搜索到 ${toolResult.found} 条航班报价，请在左侧机票面板确认`);
        } else {
          showToast(toolResult.error ?? '未找到航班报价', 'warning');
        }
      } else {
        const warnMsg =
          droppedNote ||
          result.warnings?.join('；') ||
          '解析完成，但未提取到可写入的字段，请补充目的地、天数等信息';
        showToast(warnMsg, 'warning');
      }

      if (patches.length > 0 && toolResult.searched) {
        if (toolResult.found > 0) {
          showToast(`同时已搜索到 ${toolResult.found} 条航班报价`);
        } else if (toolResult.error) {
          showToast(toolResult.error, 'warning');
        }
      }
    } catch (err) {
      setStreamingHint(null);

      if (shouldUseDemoFallback(err)) {
        const fresh = usePlanStore.getState().getActivePlan();
        const fallback = parseDemoChat(text, fresh.phase);
        setApiStatus('fallback');
        settleParseActivity();
        addChatMessage('assistant', fallback.reply, { chat_mode: chatModeNow });
        if (fallback.patches.length > 0) {
          applyPatchesWithLowRiskAuto(fallback.patches);
        }
        showToast(
          `后端未连接，已使用本地演示解析（${err instanceof ChatApiError ? err.message : '网络异常'}）`,
          'warning',
        );
        return;
      }

      const reason = err instanceof ChatApiError ? err.message : '请求失败';
      const status = err instanceof ChatApiError ? err.status : 0;
      if (status === 503) setApiStatus('llm_unconfigured');
      else if (status >= 400) setApiStatus('online');

      settleParseActivity(reason);
      addChatMessage('assistant', `解析失败：${reason}`, { chat_mode: chatModeNow });
      showToast(
        status === 503
          ? 'LLM 未配置，请在 .env 设置 DEEPSEEK_API_KEY'
          : `解析失败（${reason}）`,
        'warning',
      );
    } finally {
      setIsLoading(false);
      setStreamingHint(null);
      if (usePlanStore.getState().chatActivity?.op === 'parse') {
        setChatActivity(null);
      }
    }
  };

  const placeholder = selectedNodeName
    ? `针对「${selectedNodeName}」说修改，如：改到 18:00、加点美食`
    : plan.phase === 'detailed'
      ? '调整行程，或说「优化适配当前机酒」…'
      : '例如：上海→新加坡，8/30–9/2，两人，偏购物…';

  const busy = isLoading || isGeneratingItinerary;
  const composerDisabled = apiStatus === 'offline' || apiStatus === 'checking';

  /** Activity 进行中时以步骤气泡为主，避免与流式气泡叠两层 */
  const activeStreaming =
    chatActivity != null
      ? null
      : isLoading
        ? streamingHint
        : isGeneratingItinerary &&
            generationProgress.phase === 'llm' &&
            generationProgress.llmLatencyMs == null
          ? (generationProgress.llmPreview ?? '')
          : null;

  return (
    <section className="chat-panel">
      <div className="chat-panel__head">
        <h2 className="chat-panel__title">智能对话</h2>
        <div className="chat-panel__badges">
          {onCollapse && (
            <button type="button" className="chat-panel__collapse" onClick={onCollapse}>
              折叠
            </button>
          )}
          <span className="chat-panel__mode">{modeLabel}</span>
          {selectedNodeName && (
            <span className="chat-panel__selection" title="当前选区">
              {selectedNodeName}
            </span>
          )}
          {apiStatus === 'checking' && (
            <span className="chat-panel__api chat-panel__api--checking">检测中…</span>
          )}
          {apiStatus === 'online' && (
            <span className="chat-panel__api chat-panel__api--ok">API</span>
          )}
          {apiStatus === 'llm_unconfigured' && (
            <span className="chat-panel__api chat-panel__api--warn">LLM 未配置</span>
          )}
          {apiStatus === 'offline' && (
            <span className="chat-panel__api chat-panel__api--fallback">离线</span>
          )}
          {apiStatus === 'fallback' && (
            <span className="chat-panel__api chat-panel__api--fallback">本地</span>
          )}
        </div>
      </div>

      <ChatStatusBar
        apiStatus={apiStatus}
        phase={plan.phase}
        generationProgress={generationProgress}
      />

      <PlanSummaryCard
        onPrefill={prefillComposer}
        onRequestGenerate={openReadiness}
      />

      <div className="chat-panel__main">
        <ChatMessageList
          messages={plan.chat_messages}
          streamingContent={activeStreaming}
          activity={chatActivity}
          emptyHint={emptyHint}
          footer={
            showReadiness ? (
              <ReadinessChecklist
                onClose={() => setShowReadiness(false)}
                onPrefill={prefillComposer}
              />
            ) : null
          }
        />
      </div>

      <div className="chat-panel__dock">
        <PatchUndoBar />
        <PatchConfirmPanel />
        <ChatComposer
          ref={composerRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          isLoading={busy}
          disabled={composerDisabled}
          placeholder={placeholder}
        />
      </div>
    </section>
  );
}
