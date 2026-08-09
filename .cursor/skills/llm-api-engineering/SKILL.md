---
name: llm-api-engineering
description: Engineers production-grade LLM API integrations with OpenAI-compatible providers, structured JSON output, retries, streaming, and observability. Use when building chat/parse/generate endpoints, configuring DeepSeek/OpenAI clients, Pydantic schemas, SSE, or debugging LLM calls in Python/FastAPI backends.
---

# LLM API 工程化

将 LLM 调用当作**不可靠外部服务**来设计：超时、重试、结构化校验、可观测性缺一不可。

## 何时使用

- 新增 `POST /chat/parse`、`/itineraries/generate` 等后端路由
- 配置 `.env` 中 `DEEPSEEK_API_BASE`、`LLM_MODEL` 等
- 强制 LLM 输出 JSON / Pydantic 模型
- 实现 SSE 流式响应或批量生成

## 环境配置（本项目约定）

```bash
LLM_PROVIDER=openai          # OpenAI 兼容协议
LLM_MODEL=deepseek-v4-pro
LLM_MODEL_REWRITE=deepseek-v4-flash
DEEPSEEK_API_KEY=...
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
```

客户端统一走 OpenAI SDK，`base_url` 指向兼容端点，**密钥只从环境变量读取，禁止硬编码或提交到仓库**。

## 分层架构

```
Route (FastAPI)
  → Service（业务编排：prompt 组装、多步调用）
    → LLMClient（薄封装：chat / stream / parse）
      → Provider（OpenAI-compatible HTTP）
  → Schema（Pydantic 入参/出参）
```

Route 层不写 prompt 细节；Service 层不直接拼 HTTP。

## 结构化输出（强制）

**永远假设模型会输出脏 JSON。** 流程：

1. 用 JSON Schema 或 Pydantic 定义目标结构（如 `FormPatch[]`、`Itinerary`）
2. System prompt 明确要求「仅输出 JSON，无 markdown 围栏」
3. 解析失败 → 最多 1 次修复轮（把错误信息喂回模型）
4. 仍失败 → 返回 422 + 可读错误，**不静默降级**

```python
from pydantic import BaseModel, Field
from typing import Literal

class FormPatch(BaseModel):
    action: Literal["set", "append", "fork_plan", ...]
    field: str | None = None
    value: str | None = None
    summary: str
```

## 请求参数基线

| 参数 | 建议 |
|------|------|
| `temperature` | 解析/抽取 `0–0.3`；创意文案 `0.5–0.8` |
| `max_tokens` | 按输出 Schema 估算，留 20% 余量；**行程 generate 默认 ≥8000**（`LLM_MAX_TOKENS_GENERATE`）；reasoning 模型勿把空 content 当成 `{}` |
| `thinking` | DeepSeek V4 默认开启且与 content **共用** max_tokens；**结构化 JSON（generate/fix）须 `thinking: disabled`**，否则易 length + 空 content |
| `timeout` | 连接 10s，读 60–120s（长生成） |
| `response_format` | 支持时用 `{"type": "json_object"}` |

## 重试与容错

```python
# 仅对可重试错误：429、502、503、超时
# 指数退避：1s → 2s → 4s，最多 3 次
# 不对 400/401/422 重试
```

- **幂等**：同一 `request_id` 可安全重放解析类请求
- **熔断**：连续失败后短暂拒绝，避免烧额度

## 流式（SSE）

生成类接口（行程生成）优先 SSE：

```
event: progress
data: {"step": "geocoding", "done": 3, "total": 12}

event: result
data: {"itinerary": {...}}
```

- `Content-Type: text/event-stream`
- 心跳：每 15s 发送 `: ping\n\n`
- 客户端断开时取消上游 LLM 请求

## Prompt 工程要点

1. **角色 + 任务 + 输出格式** 三段式，格式放最后（近因效应）
2. 注入 **当前计划上下文**（`trip_request`、`phase`、最近 N 条对话）
3. `supplement` 模式：禁止直接改 `destination`，须输出 `fork_plan`
4. 示例用 **中文**，与产品语言一致

## 可观测性

- 记录：`model`、`latency_ms`、`prompt_tokens`、`completion_tokens`、`success`
- 可选 Langfuse（`.env` 中 `LANGFUSE_*`）
- **禁止**日志打印完整 API Key 或用户 PII

## 安全清单

- [ ] API Key 仅环境变量
- [ ] 输入长度上限（如 `free_text` ≤ 8k 字符）
- [ ] 输出经 Pydantic 校验后再写库/返回前端
- [ ] CORS 仅允许配置的来源（`CORS_ORIGINS`）
- [ ] **Prompt 注入面**：勿用「若 user 消息含某标记则遵守」类用户文本触发开关；结构化硬约束与 UGC/用户偏好分块隔离（`HARD CONSTRAINTS` / `USER_DATA` / `UNTRUSTED_UGC`）
- [ ] 公网部署前：鉴权或限流（`SEC-02`）；勿将 `*_API_BASE` 指向不可信主机（`SEC-04`）

## 反模式

- ❌ 直接 `json.loads` 不做校验
- ❌ 解析失败返回空对象糊弄前端（含 `content or "{}"`）
- ❌ 在 prompt 里塞 web_search 猜坐标（本项目走 Geocoding API）
- ❌ 同步阻塞 Event Loop（用 `async` + `httpx`/`openai` async client）
- ❌ system prompt 把用户可控字符串当作指令开关（会覆盖结构化约束）

## 延伸阅读

- 本项目 Schema：[`docs/项目分析与设计文档.md`](../../../docs/项目分析与设计文档.md) §3、§6
- Phase 2 接口：`POST /api/v1/chat/parse`、`POST /api/v1/itineraries/generate`
