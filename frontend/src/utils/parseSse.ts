export interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** 从 buffer 解析完整 SSE 事件块（以 \n\n 分隔） */
export function parseSseBuffer(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const events: ParsedSseEvent[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const block of parts) {
    if (!block.trim() || block.trim().startsWith(':')) continue;

    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) continue;

    try {
      const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
      events.push({ event, data });
    } catch {
      /* ignore malformed chunk */
    }
  }

  return { events, rest };
}

export interface SseStreamHandlers {
  onEvent?: (event: string, data: Record<string, unknown>) => void;
}

/** POST 请求并消费 SSE 流，直到 result 或 error 事件 */
export async function consumeSsePost(
  url: string,
  body: unknown,
  handlers: SseStreamHandlers = {},
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = (await res.json()) as { detail?: string };
      if (errBody.detail) detail = errBody.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取 SSE 流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;

    for (const { event, data } of events) {
      handlers.onEvent?.(event, data);
      if (event === 'error') {
        throw new Error(String(data.detail ?? 'SSE 错误'));
      }
    }
  }
}
