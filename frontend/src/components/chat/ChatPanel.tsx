import { useCallback, useEffect, useState } from 'react';
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
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { ChatStatusBar } from './ChatStatusBar';
import { PatchConfirmPanel } from './PatchConfirmPanel';
import { getChatModeLabel, parseDemoChat } from './chatDemo';
import type { ChatMode, ChatParseSelection } from '../../types/travelPlan';
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

export function ChatPanel({ onCollapse, selectedNodeName }: ChatPanelProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const addChatMessage = usePlanStore((s) => s.addChatMessage);
  const addPendingPatches = usePlanStore((s) => s.addPendingPatches);
  const setLastChatMode = usePlanStore((s) => s.setLastChatMode);
  const isGeneratingItinerary = usePlanStore((s) => s.isGeneratingItinerary);
  const generationProgress = usePlanStore((s) => s.generationProgress);
  const showToast = useToastStore((s) => s.show);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingHint, setStreamingHint] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  const modeLabel = getChatModeLabel(plan.phase);
  const emptyHint =
    plan.phase === 'detailed'
      ? '补充行程细节，例如调整某景点时间。换目的地请说「改去曼谷」。'
      : '用自然语言描述行程，例如「新加坡 4 天，美食 + 亲子」。解析后需确认，确认后将自动生成路线图。';

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
    setIsLoading(true);
    setStreamingHint('');

    const afterUser = usePlanStore.getState().getActivePlan();

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
              onDelta: (preview) => setStreamingHint(preview),
              onValidating: () =>
                setStreamingHint((prev) => prev || '正在校验解析结果…'),
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

      if (patches.length > 0) {
        addPendingPatches(patches);
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
        showToast(
          `已解析 ${patches.length} 项修改，请在消息中查看摘要并展开确认${conflictNote}${warnNote}`,
        );
      } else {
        const warnMsg =
          droppedNote ||
          result.warnings?.join('；') ||
          '解析完成，但未提取到可写入的字段，请补充目的地、天数等信息';
        showToast(warnMsg, droppedNote || (result.warnings?.length ?? 0) > 0 ? 'warning' : 'warning');
      }
    } catch (err) {
      setStreamingHint(null);

      if (shouldUseDemoFallback(err)) {
        const fresh = usePlanStore.getState().getActivePlan();
        const fallback = parseDemoChat(text, fresh.phase);
        setApiStatus('fallback');
        addChatMessage('assistant', fallback.reply, { chat_mode: chatModeNow });
        if (fallback.patches.length > 0) addPendingPatches(fallback.patches);
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
    }
  };

  const placeholder = selectedNodeName
    ? `针对「${selectedNodeName}」用对话修改，如：改到 18:00`
    : plan.phase === 'detailed'
      ? '补充或调整行程…'
      : '描述你的旅行计划…';

  const busy = isLoading || isGeneratingItinerary;
  const composerDisabled = apiStatus === 'offline' || apiStatus === 'checking';

  const generateStreaming =
    isGeneratingItinerary &&
    generationProgress.phase === 'llm' &&
    generationProgress.llmLatencyMs == null
      ? (generationProgress.llmPreview ?? '')
      : null;
  const activeStreaming = isLoading ? streamingHint : generateStreaming;

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

      <div className="chat-panel__main">
        <ChatMessageList
          messages={plan.chat_messages}
          streamingContent={activeStreaming}
          emptyHint={emptyHint}
        />
      </div>

      <div className="chat-panel__dock">
        <PatchConfirmPanel />
        <ChatComposer
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
