import type { ItineraryEvidenceItem } from '../types/itinerary';
import {
  getCachedEvidenceFromLink,
  setCachedEvidenceFromLink,
} from '../utils/evidenceLinkCache';

const apiBase = () => import.meta.env.VITE_API_BASE ?? '';

export class EvidenceApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EvidenceApiError';
    this.status = status;
  }
}

export interface EvidenceFromLinkResult {
  ok: boolean;
  item: ItineraryEvidenceItem | null;
  error: string | null;
  provider: string | null;
  /** localStorage hit — no network */
  fromCache?: boolean;
}

export interface FetchEvidenceFromLinkOptions {
  destination?: string | null;
  /** Skip localStorage and force API */
  forceRefresh?: boolean;
}

/** Per-module 检索：拉取单条粘贴链接的核心内容（同链 localStorage 缓存） */
export async function fetchEvidenceFromLink(
  url: string,
  destinationOrOptions?: string | null | FetchEvidenceFromLinkOptions,
): Promise<EvidenceFromLinkResult> {
  const opts: FetchEvidenceFromLinkOptions =
    typeof destinationOrOptions === 'object' && destinationOrOptions !== null
      ? destinationOrOptions
      : { destination: destinationOrOptions };

  if (!opts.forceRefresh) {
    const cached = getCachedEvidenceFromLink(url);
    if (cached) return cached;
  }

  const res = await fetch(`${apiBase()}/api/v1/ugc/evidence/from-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      ...(opts.destination?.trim() ? { destination: opts.destination.trim() } : {}),
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as {
        detail?: string | Array<{ msg?: string; type?: string; loc?: unknown }>;
      };
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        const first = body.detail[0];
        detail =
          first.type === 'string_too_long'
            ? '链接过长：请只粘贴小红书链接，不要粘贴控制台报错'
            : first.msg || detail;
      }
    } catch {
      /* ignore */
    }
    throw new EvidenceApiError(detail, res.status);
  }

  const data = (await res.json()) as EvidenceFromLinkResult;
  if (data.ok && data.item) {
    setCachedEvidenceFromLink(url, data.item, data.provider);
  }
  return { ...data, fromCache: false };
}
