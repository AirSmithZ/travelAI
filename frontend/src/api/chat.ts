import type { Itinerary } from '../types/itinerary';
import type { ChatMessage, ChatParseSelection, FormPatch, PlanPhase, ChatMode } from '../types/travelPlan';
import type { TripRequest } from '../types/tripRequest';
import { normalizeFormPatch } from '../utils/patchSchema';
import { sanitizeFormPatches } from '../utils/formPatchTool';
import { compactItineraryForParse } from '../utils/compactItineraryForParse';
import { consumeSsePost } from '../utils/parseSse';

const PARSE_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 5_000;
const PARSE_RETRYABLE = new Set([502, 503]);
const PARSE_MAX_ATTEMPTS = 3;

export interface ChatParseRequest {
  message: string;
  chat_mode: 'global' | 'supplement';
  plan_phase: PlanPhase;
  plan_id: string;
  trip_request: TripRequest;
  itinerary?: Itinerary | null;
  chat_history: ChatMessage[];
  selection?: ChatParseSelection | null;
  client_request_id?: string;
}

/** B-FLT-01: client-executed tools from /chat/parse (Ignav runs on frontend). */
export interface ChatToolCall {
  name: 'search_flights';
  args: {
    origin: string;
    destination: string;
    date: string;
    return_date?: string | null;
    adults?: number;
    preference?: 'cheap' | 'fast' | 'balanced';
  };
}

export interface ChatParseResponse {
  reply: string;
  patches: FormPatch[];
  warnings?: string[];
  dropped_patch_count?: number;
  chat_mode_used?: ChatMode;
  tool_calls?: ChatToolCall[];
}

export class ChatApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildParseBody(req: ChatParseRequest): Record<string, unknown> {
  const useCompact =
    req.chat_mode === 'supplement' && req.itinerary != null;
  return {
    message: req.message,
    chat_mode: req.chat_mode,
    plan_phase: req.plan_phase,
    plan_id: req.plan_id,
    trip_request: req.trip_request,
    itinerary: useCompact
      ? compactItineraryForParse(req.itinerary!)
      : (req.itinerary ?? undefined),
    selection: req.selection ?? undefined,
    chat_history: req.chat_history.slice(-20),
    client_request_id: req.client_request_id,
  };
}

async function parseChatMessageOnce(
  req: ChatParseRequest,
  base: string,
): Promise<ChatParseResponse> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/chat/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutSignal(PARSE_TIMEOUT_MS),
      body: JSON.stringify(buildParseBody(req)),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ChatApiError('解析超时，请稍后重试', 408);
    }
    throw new ChatApiError('网络异常，请检查后端是否启动', 0);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ChatApiError(detail, res.status);
  }

  const data = (await res.json()) as {
    reply: string;
    patches: FormPatch[];
    warnings?: string[];
    dropped_patch_count?: number;
    chat_mode_used?: ChatMode;
    tool_calls?: ChatToolCall[];
  };
  return normalizeParseResponse(data);
}

function normalizeToolCalls(raw: ChatToolCall[] | undefined): ChatToolCall[] {
  if (!raw?.length) return [];
  return raw.filter(
    (t): t is ChatToolCall =>
      t?.name === 'search_flights' &&
      typeof t.args?.origin === 'string' &&
      typeof t.args?.destination === 'string' &&
      typeof t.args?.date === 'string',
  );
}

function normalizeParseResponse(data: {
  reply: string;
  patches: FormPatch[];
  warnings?: string[];
  dropped_patch_count?: number;
  chat_mode_used?: ChatMode;
  tool_calls?: ChatToolCall[];
}): ChatParseResponse {
  const normalized = data.patches.map((p) => normalizeFormPatch(p));
  const { patches, rejected } = sanitizeFormPatches(normalized);
  const extraWarnings = rejected.length
    ? [`已过滤 ${rejected.length} 条不在数据结构内的 patch`]
    : [];
  return {
    reply: data.reply,
    patches,
    warnings: [...extraWarnings, ...(data.warnings ?? [])],
    dropped_patch_count: (data.dropped_patch_count ?? 0) + rejected.length,
    chat_mode_used: data.chat_mode_used,
    tool_calls: normalizeToolCalls(data.tool_calls),
  };
}

export type ParseStreamHandlers = {
  /** 从部分 JSON 提取的 reply 预览（打字机效果） */
  onDelta?: (replyPreview: string) => void;
  /** validate 修复轮 */
  onValidating?: () => void;
  /** UX-CHAT-07: provider reasoning when present */
  onReasoning?: (text: string) => void;
};

/** SSE 流式 parse：LLM token → reply_preview → result（P99） */
export async function parseChatMessageStream(
  req: ChatParseRequest,
  handlers?: ParseStreamHandlers,
): Promise<ChatParseResponse> {
  const base = import.meta.env.VITE_API_BASE ?? '';
  const body = {
    ...req,
    client_request_id: req.client_request_id ?? crypto.randomUUID(),
  };

  let result: ChatParseResponse | null = null;

  try {
    await consumeSsePost(`${base}/api/v1/chat/parse/stream`, buildParseBody(body), {
      onEvent: (event, data) => {
        if (event === 'delta') {
          handlers?.onDelta?.(String(data.reply_preview ?? ''));
        }
        if (event === 'progress' && data.step === 'reasoning' && data.text) {
          handlers?.onReasoning?.(String(data.text));
        }
        if (event === 'progress' && data.step === 'validate') {
          if (data.status === 'fixing' || data.status === 'running') {
            handlers?.onValidating?.();
          }
        }
        if (event === 'result') {
          result = normalizeParseResponse(data as {
            reply: string;
            patches: FormPatch[];
            warnings?: string[];
            dropped_patch_count?: number;
            chat_mode_used?: ChatMode;
            tool_calls?: ChatToolCall[];
          });
        }
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ChatApiError('解析超时，请稍后重试', 408);
    }
    if (err instanceof Error && err.message) {
      throw new ChatApiError(err.message, 502);
    }
    throw new ChatApiError('网络异常，请检查后端是否启动', 0);
  }

  if (!result) throw new ChatApiError('解析未返回结果', 502);
  return result;
}

/** 带 502/503 有限重试（P78） */
export async function parseChatMessage(req: ChatParseRequest): Promise<ChatParseResponse> {
  const base = import.meta.env.VITE_API_BASE ?? '';
  const body = {
    ...req,
    client_request_id: req.client_request_id ?? crypto.randomUUID(),
  };

  let lastErr: ChatApiError | null = null;
  for (let attempt = 0; attempt < PARSE_MAX_ATTEMPTS; attempt++) {
    try {
      return await parseChatMessageOnce(body, base);
    } catch (err) {
      if (!(err instanceof ChatApiError)) throw err;
      lastErr = err;
      if (PARSE_RETRYABLE.has(err.status) && attempt < PARSE_MAX_ATTEMPTS - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new ChatApiError('解析失败', 0);
}

export interface HealthResponse {
  status: string;
  llm_configured: boolean;
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const base = import.meta.env.VITE_API_BASE ?? '';
    const res = await fetch(`${base}/health`, { signal: timeoutSignal(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** 是否允许降级为本地 demo（仅离线/网络错误） */
export function shouldUseDemoFallback(err: unknown): boolean {
  if (!(err instanceof ChatApiError)) return true;
  return err.status === 0;
}

/** 格式化 dropped_patch_count 提示（P79） */
export function formatDroppedPatchNotice(count: number, warnings?: string[]): string {
  if (count <= 0) return warnings?.join('；') ?? '';
  const base = `已忽略 ${count} 条无法写入的 patch`;
  if (!warnings?.length) return base;
  return `${base}（${warnings[0]}）`;
}
