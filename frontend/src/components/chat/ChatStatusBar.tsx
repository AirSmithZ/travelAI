import type { ReactNode } from 'react';
import type { PlanPhase } from '../../types/travelPlan';
import type { GenerationProgress } from '../../stores/usePlanStore';
import './Chat.css';

type ApiStatus = 'checking' | 'online' | 'llm_unconfigured' | 'offline' | 'fallback';

interface ChatStatusBarProps {
  apiStatus: ApiStatus;
  phase: PlanPhase;
  generationProgress: GenerationProgress;
}

function formatLlmSeconds(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 合并顶部 banner，按优先级只展示一条（P72） */
export function ChatStatusBar({ apiStatus, phase, generationProgress }: ChatStatusBarProps) {
  let content: ReactNode = null;
  let tone: 'error' | 'warn' | 'info' | 'mode' = 'info';

  if (apiStatus === 'offline') {
    tone = 'error';
    content = (
      <>
        后端未启动。请运行 <code>uvicorn app.main:app --reload --port 8000</code>
      </>
    );
  } else if (apiStatus === 'llm_unconfigured') {
    tone = 'warn';
    content = (
      <>
        后端已连接但 LLM 未配置。请在 <code>.env</code> 设置 <code>DEEPSEEK_API_KEY</code>
      </>
    );
  } else if (generationProgress.phase === 'llm') {
    tone = 'info';
    const llmSec = formatLlmSeconds(generationProgress.llmLatencyMs);
    const preview = generationProgress.llmPreview?.trim();
    if (llmSec) {
      content = `AI 生成完成（${llmSec}），正在写入…`;
    } else if (preview) {
      content = `正在生成路线图：${preview}`;
    } else {
      content = '正在 AI 生成路线图…';
    }
  } else if (generationProgress.phase === 'geocode') {
    tone = 'info';
    const { geocodeDone = 0, geocodeTotal = 0, llmLatencyMs } = generationProgress;
    const llmSec = formatLlmSeconds(llmLatencyMs);
    if (geocodeTotal > 0) {
      content = llmSec
        ? `AI 已生成（${llmSec}）· 补坐标 ${geocodeDone}/${geocodeTotal}…`
        : `正在补全坐标 ${geocodeDone}/${geocodeTotal}…`;
    } else {
      content = llmSec ? `AI 已生成（${llmSec}）· 坐标补全中…` : '正在补全地图坐标…';
    }
  } else if (phase === 'detailed') {
    tone = 'mode';
    content = '细节补充模式 · 可调整节点、时间或交通；换目的地请说「改去 XX」';
  }

  if (!content) return null;

  return (
    <p className={`chat-panel__status chat-panel__status--${tone}`} role="status">
      {content}
    </p>
  );
}
