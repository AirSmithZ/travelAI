/** UX-CHAT-05: ephemeral pipeline activity (not persisted until finalize). */

export type ChatActivityOp = 'parse' | 'generate' | 'flight_search' | 'geocode';

export type ChatActivityStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface ChatActivityStep {
  id: string;
  label: string;
  status: ChatActivityStepStatus;
  detail?: string;
}

export interface ChatActivitySession {
  id: string;
  op: ChatActivityOp;
  title: string;
  startedAt: number;
  steps: ChatActivityStep[];
  error?: string;
  /** UX-CHAT-07: provider reasoning when present; UI collapses by default */
  reasoning?: string;
}

export function createParseActivity(): ChatActivitySession {
  return {
    id: crypto.randomUUID(),
    op: 'parse',
    title: '正在理解需求',
    startedAt: Date.now(),
    steps: [
      { id: 'ack', label: '已收到消息', status: 'done' },
      { id: 'parse_llm', label: '提取行程字段', status: 'running' },
      { id: 'parse_validate', label: '校验结果', status: 'pending' },
    ],
  };
}

export function createGenerateActivity(hasFlights: boolean): ChatActivitySession {
  return {
    id: crypto.randomUUID(),
    op: 'generate',
    title: '正在生成玩法',
    startedAt: Date.now(),
    steps: [
      { id: 'ack', label: hasFlights ? '已确认航班与目的地' : '已受理生成请求', status: 'done' },
      { id: 'evidence', label: '检索玩法参考', status: 'pending' },
      { id: 'weather', label: '拉取天气预报', status: 'pending' },
      { id: 'generate_llm', label: '生成日程', status: 'pending' },
      { id: 'geocode', label: '补全地图坐标', status: 'pending' },
    ],
  };
}

export function createFlightSearchActivity(route: string): ChatActivitySession {
  return {
    id: crypto.randomUUID(),
    op: 'flight_search',
    title: '正在搜索航班',
    startedAt: Date.now(),
    steps: [
      { id: 'ack', label: '已受理搜票', status: 'done' },
      { id: 'search', label: `查询 ${route}`, status: 'running' },
    ],
  };
}

export function patchActivityStep(
  session: ChatActivitySession,
  stepId: string,
  patch: Partial<ChatActivityStep>,
): ChatActivitySession {
  return {
    ...session,
    steps: session.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
  };
}

export function formatActivitySummary(session: ChatActivitySession, elapsedMs: number): string {
  const sec = Math.max(1, Math.round(elapsedMs / 1000));
  const lines = session.steps
    .filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'error')
    .map((s) => {
      const mark =
        s.status === 'done' ? '✓' : s.status === 'skipped' ? '○' : s.status === 'error' ? '✗' : '·';
      return `${mark} ${s.label}${s.detail ? `（${s.detail}）` : ''}`;
    });
  const head =
    session.error != null
      ? `${session.title}失败（${sec}s）`
      : `${session.title}完成（用时 ${sec}s）`;
  if (!lines.length) return head;
  return `${head}\n${lines.join('\n')}`;
}
