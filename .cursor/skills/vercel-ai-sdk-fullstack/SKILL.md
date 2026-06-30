---
name: vercel-ai-sdk-fullstack
description: Builds full-stack AI features with Vercel AI SDK (ai package, streamText, generateObject, useChat) in Next.js or Vite+API routes. Use when implementing streaming chat, tool calling, React hooks for LLM UI, or wiring OpenAI-compatible providers like DeepSeek via custom baseURL.
---

# Vercel AI SDK 全栈

用 **Vercel AI SDK**（`ai` + provider 包）统一前后端 LLM 交互，避免手写 SSE 与状态机。

## 何时使用

- Next.js App Router 或 Node API Route 需要流式对话
- React 前端用 `useChat` / `useCompletion` 消费流
- 结构化输出用 `generateObject` + Zod
- 工具调用（Function Calling）编排多步任务

## 安装

```bash
npm install ai @ai-sdk/openai zod
# React hooks
npm install @ai-sdk/react   # 或从 'ai/react' 导入（视版本）
```

## Provider：DeepSeek（OpenAI 兼容）

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const deepseek = createOpenAI({
  baseURL: process.env.DEEPSEEK_API_BASE ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const model = deepseek('deepseek-v4-pro');
```

环境变量与后端 `.env` 保持一致，**前端 Route Handler 中读取，勿暴露到客户端 bundle**。

## 后端：流式文本

```typescript
// app/api/chat/route.ts (Next.js)
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model,
    messages,
    temperature: 0.3,
    maxTokens: 2048,
  });

  return result.toDataStreamResponse();
}
```

## 后端：结构化对象

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const PatchSchema = z.object({
  patches: z.array(z.object({
    action: z.enum(['set', 'append', 'fork_plan']),
    field: z.string().optional(),
    value: z.unknown().optional(),
    summary: z.string(),
  })),
});

const { object } = await generateObject({
  model,
  schema: PatchSchema,
  prompt: userMessage,
});
```

用于 `chat/parse` → `FormPatch[]`，与 Pydantic 后端 Schema 对齐。

## 前端：useChat

```tsx
'use client';
import { useChat } from '@ai-sdk/react';

export function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} data-role={m.role}>{m.content}</div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <textarea value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>发送</button>
      </form>
    </>
  );
}
```

## Vite 纯前端项目（本项目现状）

前端 `localhost:5173`，后端 FastAPI `localhost:8000` 时：

1. **推荐**：`useChat({ api: 'http://localhost:8000/api/v1/chat' })` 指向 FastAPI SSE
2. 或加 Vite 代理 `/api` → 后端
3. **不要**在浏览器直接调 DeepSeek API（密钥泄露）

若引入 Next.js BFF，再用 AI SDK Route Handler 做代理层。

## 工具调用（Tools）

```typescript
import { streamText, tool } from 'ai';
import { z } from 'zod';

const result = streamText({
  model,
  tools: {
    geocode: tool({
      description: '地理编码景点名称',
      parameters: z.object({ query: z.string(), city: z.string() }),
      execute: async ({ query, city }) => geocodeService(query, city),
    }),
  },
  maxSteps: 5,
});
```

## 错误处理

```typescript
try {
  const result = await generateObject({ ... });
} catch (e) {
  if (e instanceof Error && e.name === 'AI_JSONParseError') {
    // 触发修复轮或返回用户可读错误
  }
}
```

## 与 travel 项目集成路径

| 阶段 | 方案 |
|------|------|
| Phase 2a | FastAPI `chat/parse` + 前端 `fetch` 或 `@ai-sdk/react` 若加 BFF |
| 可选 BFF | Next.js `/api/chat` 代理 DeepSeek，`useChat` 直连 |
| 生成行程 | `streamText` 或自定义 SSE 事件 `progress` / `result` |

## 反模式

- ❌ 在 Client Component 内 `OPENAI_API_KEY`
- ❌ 忽略 `abortSignal`（用户取消应中断流）
- ❌ 流式 UI 不处理 `isLoading` / 空状态
- ❌ Zod Schema 与后端 Pydantic 字段名不一致

## 参考

- [AI SDK 文档](https://sdk.vercel.ai/docs)
- 本项目对话 UI：[`frontend/src/components/input/InputPanel.tsx`](../../../frontend/src/components/input/InputPanel.tsx)
