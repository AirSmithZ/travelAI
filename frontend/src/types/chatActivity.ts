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

/** Best-effort preview from user text for Activity detail (not a second parser). */
export function summarizeParseHintFromMessage(message: string): string | undefined {
  const text = message.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;

  const parts: string[] = [];

  const route = text.match(
    /(?:从)?([\u4e00-\u9fffA-Za-z]{2,12})(?:到|至|→|->|－|-|—)([\u4e00-\u9fffA-Za-z]{2,12})/,
  );
  if (route?.[2]) parts.push(route[2]);

  const dayMatch = text.match(/(\d+)\s*天/);
  if (dayMatch) parts.push(`${dayMatch[1]}天`);

  const dateTokens = text.match(/\d{1,2}\s*[./月]\s*\d{1,2}/g);
  if (dateTokens?.length) {
    const norm = dateTokens.slice(0, 2).map((d) => d.replace(/\s*月\s*/, '/').replace(/\s/g, ''));
    parts.push(norm.join('–'));
  }

  const people = text.match(/(\d+)\s*人/);
  if (people) parts.push(`${people[1]}人`);

  const budgetPer =
    text.match(/人均\s*([\d.]+)\s*万/) || text.match(/预算[^。；;\n]{0,12}?([\d.]+)\s*万/);
  if (budgetPer) parts.push(`人均${budgetPer[1]}万`);

  return parts.length ? parts.join(' · ') : undefined;
}

export function createParseActivity(hint?: string): ChatActivitySession {
  const detail = hint?.trim() || undefined;
  return {
    id: crypto.randomUUID(),
    op: 'parse',
    title: '正在识别行程信息',
    startedAt: Date.now(),
    steps: [
      {
        id: 'parse_llm',
        label: '识别行程信息',
        status: 'running',
        ...(detail ? { detail } : {}),
      },
      { id: 'parse_validate', label: '整理待确认项', status: 'pending' },
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

function activityTitleBare(title: string): string {
  return title.replace(/^正在/, '');
}

export function formatActivitySummary(session: ChatActivitySession, elapsedMs: number): string {
  const sec = Math.max(1, Math.round(elapsedMs / 1000));
  const bare = activityTitleBare(session.title);
  const lines = session.steps
    .filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'error')
    .map((s) => {
      const mark =
        s.status === 'done' ? '✓' : s.status === 'skipped' ? '○' : s.status === 'error' ? '✗' : '·';
      return `${mark} ${s.label}${s.detail ? `（${s.detail}）` : ''}`;
    });
  const head =
    session.error != null ? `${bare}失败（${sec}s）` : `${bare}完成（用时 ${sec}s）`;
  if (!lines.length) return head;
  return `${head}\n${lines.join('\n')}`;
}
