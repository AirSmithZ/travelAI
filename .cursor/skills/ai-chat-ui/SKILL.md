---
name: ai-chat-ui
description: Builds production AI chat interfaces—message list, streaming, composer, patch confirmation cards, and scroll behavior. Use when implementing chat panels, LLM conversation UI, FormPatch confirm flows, or upgrading InputPanel-style components in React.
---

# AI Chat UI 生成

生成**可用的对话界面**，不是 Demo 气泡堆砌。关注状态、确认流、与业务表单联动。

## 何时使用

- 实现/改造 `InputPanel`、侧边对话栏、全屏 Chat
- 流式 assistant 回复、打字机效果
- `FormPatch` 二次确认卡（set / fork_plan）
- global vs supplement 对话模式 UI 差异

## 布局结构

```
┌─ 对话区 ─────────────────────┐
│  [系统提示 / 空状态]           │
│  user bubble (右)              │
│  assistant bubble (左)         │
│  ┌─ PatchConfirmCard ─────┐   │
│  │ 摘要 + [确认] [取消]    │   │
│  └────────────────────────┘   │
├─ Composer（固定底）──────────┤
│  textarea + 发送               │
└──────────────────────────────┘
```

- 消息区 `flex:1; overflow-y:auto`
- Composer `flex-shrink:0`，支持 Enter 发送、Shift+Enter 换行

## 消息模型

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  // 可选：关联 patches
  patches?: FormPatch[];
}
```

- 列表用 `message.id` 作 key
- assistant 流式时：先插入空消息，逐 chunk 追加 `content`

## 流式 UI 模式

**模式 A — 整段替换（简单）**

```tsx
const [streaming, setStreaming] = useState('');
// onChunk: setStreaming(prev => prev + chunk)
// onDone: addChatMessage('assistant', streaming); setStreaming('')
```

**模式 B — useChat（AI SDK）**

见 `vercel-ai-sdk-fullstack` skill。

流式时显示：
- 输入框 `disabled` 或发送钮 loading
- 最后一条 assistant 旁 **脉冲光标** `▍` 或三点跳动

## Patch 确认卡（本项目核心）

对话**不得静默改表单**。LLM 返回 patch → 卡片展示 → 用户确认后写入。

```tsx
// fork_plan 示例文案
「将为「曼谷」创建新的旅行计划，当前「新加坡 4 日游」保留。」
[创建并切换]  [取消]
```

| action | 确认后行为 |
|--------|------------|
| `set` / `append` | 写入 `trip_request` 对应字段 |
| `fork_plan` | `createEmptyPlan` + 切换，**旧计划不动** |
| `add_node` | 写入 `itinerary`（Phase 2b） |

- 确认卡视觉：浅 accent 底 + 边框，与普通消息区分
- 同屏多个 patch 纵向排列，逐个确认

## 空状态与模式提示

| phase | 空状态文案方向 |
|-------|----------------|
| `empty` / `planning` | 引导通过**对话**描述需求 |
| `detailed` | 引导补充行程细节，**不**引导改目的地（走 fork） |

可选：composer 上方小字 `global` / `supplement` 模式标签。

## 滚动行为

```typescript
// 新消息或流式更新时滚到底（仅当用户已在底部附近）
const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
if (atBottom) el.scrollTop = el.scrollHeight;
```

- 用户上翻历史时**不要**强制滚底
- 新消息提示：底部「↓ 新消息」按钮

## 无障碍

- `role="log"` 或 `aria-live="polite"` 于消息容器
- 发送按钮 `aria-busy={isLoading}`
- 确认卡焦点陷阱可选，至少按钮可键盘操作

## 样式约定（对齐本项目）

- User：accent 实底，右对齐，`max-width: 92%`
- Assistant：elevated 底 + 细边框，左对齐
- 字号 13px，行高 1.5
- 不用微信绿 / iMessage 蓝默认皮

## 反模式

- ❌ 用户发送后无 loading 反馈
- ❌ LLM 返回直接 `setState` 改表单
- ❌ 超长消息无折叠（> 500 字加「展开」）
- ❌ 错误只 `console.error` 不展示给用户

## 本项目文件

- [`ChatPanel.tsx`](../../../frontend/src/components/chat/ChatPanel.tsx)
- [`PatchConfirmCard.tsx`](../../../frontend/src/components/chat/PatchConfirmCard.tsx)
- [`InputPanel.tsx`](../../../frontend/src/components/input/InputPanel.tsx) — 对话 + 行程编辑
