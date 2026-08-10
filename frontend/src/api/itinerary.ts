import type { Itinerary } from '../types/itinerary';
import type { TravelIntel } from '../types/travelIntel';
import type { TripRequest } from '../types/tripRequest';
import { consumeSsePost } from '../utils/parseSse';

export class ItineraryApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ItineraryApiError';
    this.status = status;
  }
}

export type GenerateMode = 'generate' | 'optimize' | 'regenerate';

export interface GenerateItineraryOptions {
  /** 默认 false：首包快速返回，坐标由前端异步 geocode-nodes 补全 */
  geocode?: boolean;
  /** 已确认机酒锚点；generate Prompt 硬约束 */
  travel_intel?: TravelIntel | null;
  /** FLOW-02 */
  mode?: GenerateMode;
  current_itinerary?: Itinerary | null;
  /** doc 23: 已检索成功的用户贴链（仅 ok 模块） */
  user_evidence?: import('../types/itinerary').ItineraryEvidenceItem[] | null;
}

export interface GenerateItineraryResult {
  itinerary: Itinerary;
  llmLatencyMs?: number | null;
  geocodeLatencyMs?: number | null;
}

export interface GenerateProgressEvent {
  step: 'llm' | 'geocoding' | 'evidence' | 'weather' | 'reasoning' | 'validate';
  status?: 'running' | 'done' | 'fixing';
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  done?: number;
  total?: number;
  count?: number;
  text?: string;
}

export interface GeocodeProgressEvent {
  done: number;
  total: number;
}

export type GenerateStreamHandlers = {
  onProgress?: (evt: GenerateProgressEvent) => void;
  onDelta?: (preview: string) => void;
};

export type GeocodeStreamHandlers = {
  onProgress?: (evt: GeocodeProgressEvent) => void;
};

const apiBase = () => import.meta.env.VITE_API_BASE ?? '';

function mapGenerateProgress(data: Record<string, unknown>): GenerateProgressEvent {
  return {
    step: data.step as GenerateProgressEvent['step'],
    status: data.status as GenerateProgressEvent['status'],
    latencyMs: (data.latency_ms as number | null | undefined) ?? null,
    promptTokens: (data.prompt_tokens as number | null | undefined) ?? null,
    completionTokens: (data.completion_tokens as number | null | undefined) ?? null,
    done: data.done as number | undefined,
    total: data.total as number | undefined,
    count: typeof data.count === 'number' ? data.count : undefined,
    text: typeof data.text === 'string' ? data.text : undefined,
  };
}

/** SSE 流式生成（llm delta preview → progress → result） */
export async function generateItineraryStream(
  tripRequest: TripRequest,
  options?: GenerateItineraryOptions & GenerateStreamHandlers,
): Promise<GenerateItineraryResult> {
  const {
    geocode = false,
    travel_intel,
    mode = 'generate',
    current_itinerary,
    user_evidence,
    onProgress,
    onDelta,
  } = options ?? {};
  let result: GenerateItineraryResult | null = null;

  await consumeSsePost(
    `${apiBase()}/api/v1/itineraries/generate/stream`,
    {
      trip_request: tripRequest,
      geocode,
      mode,
      ...(travel_intel ? { travel_intel } : {}),
      ...(current_itinerary ? { current_itinerary } : {}),
      ...(user_evidence?.length ? { user_evidence } : {}),
    },
    {
      onEvent: (event, data) => {
        if (event === 'delta') {
          onDelta?.(String(data.preview ?? ''));
        }
        if (event === 'progress') {
          onProgress?.(mapGenerateProgress(data));
        }
        if (event === 'result') {
          result = {
            itinerary: data.itinerary as Itinerary,
            llmLatencyMs: (data.llm_latency_ms as number | null | undefined) ?? null,
            geocodeLatencyMs: (data.geocode_latency_ms as number | null | undefined) ?? null,
          };
        }
      },
    },
  );

  if (!result) throw new ItineraryApiError('生成未返回结果', 502);
  return result;
}

/** 非流式 fallback */
export async function generateItinerary(
  tripRequest: TripRequest,
  options?: GenerateItineraryOptions,
): Promise<GenerateItineraryResult> {
  const base = apiBase();
  const res = await fetch(`${base}/api/v1/itineraries/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trip_request: tripRequest,
      geocode: options?.geocode ?? false,
      mode: options?.mode ?? 'generate',
      ...(options?.travel_intel ? { travel_intel: options.travel_intel } : {}),
      ...(options?.current_itinerary
        ? { current_itinerary: options.current_itinerary }
        : {}),
      ...(options?.user_evidence?.length
        ? { user_evidence: options.user_evidence }
        : {}),
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ItineraryApiError(detail, res.status);
  }

  const data = (await res.json()) as {
    itinerary: Itinerary;
    llm_latency_ms?: number | null;
    geocode_latency_ms?: number | null;
  };
  return {
    itinerary: data.itinerary,
    llmLatencyMs: data.llm_latency_ms,
    geocodeLatencyMs: data.geocode_latency_ms,
  };
}

/** SSE 流式地理编码（Phase 3：progress done/total → result） */
export async function geocodeItineraryNodesStream(
  itinerary: Itinerary,
  destination: string,
  handlers?: GeocodeStreamHandlers,
  options?: { free_text?: string; notes?: string },
): Promise<Itinerary> {
  let result: Itinerary | null = null;

  await consumeSsePost(
    `${apiBase()}/api/v1/itineraries/geocode-nodes/stream`,
    {
      itinerary,
      destination,
      free_text: options?.free_text ?? '',
      notes: options?.notes ?? '',
    },
    {
      onEvent: (event, data) => {
        if (event === 'progress' && data.step === 'geocoding') {
          handlers?.onProgress?.({
            done: (data.done as number) ?? 0,
            total: (data.total as number) ?? 0,
          });
        }
        if (event === 'result') {
          result = data.itinerary as Itinerary;
        }
      },
    },
  );

  if (!result) throw new ItineraryApiError('地理编码未返回结果', 502);
  return result;
}

/** 非流式 fallback */
export async function geocodeItineraryNodes(
  itinerary: Itinerary,
  destination: string,
  options?: { free_text?: string; notes?: string },
): Promise<Itinerary> {
  const base = apiBase();
  const res = await fetch(`${base}/api/v1/itineraries/geocode-nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itinerary,
      destination,
      free_text: options?.free_text ?? '',
      notes: options?.notes ?? '',
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ItineraryApiError(detail, res.status);
  }

  const data = (await res.json()) as { itinerary: Itinerary };
  return data.itinerary;
}
