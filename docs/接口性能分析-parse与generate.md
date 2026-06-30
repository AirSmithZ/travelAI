# 接口性能分析：parse 与 generate

> 审查依据：[`llm-api-engineering`](../.cursor/skills/llm-api-engineering/SKILL.md)  
> 审查范围：`POST /api/v1/chat/parse`、`POST /api/v1/itineraries/generate` 全链路  
> 审查日期：2026-06-29

---

## 1. 现象与结论

**现象**：`parse`、`generate` 两个接口响应普遍 **10s 以上**；即使暂时不触发地理编码（geocode），延迟仍在 10s 量级。

**核心结论**：

| 判断 | 说明 |
|------|------|
| **主因是 LLM 推理耗时** | 两个接口的「不可省略路径」都包含一次（或两次）远程 LLM 调用；10–30s 在结构化 JSON 场景下属于常见区间，并非 geocode 独有 |
| **geocode 是 generate 的次要放大器** | 仅在 `generate` / `geocode-nodes` 中执行；可在首次生成时 **异步后置**，显著缩短首包时间 |
| **架构层存在可优化项** | 模型选型、prompt 体积、`max_tokens` 缺失、修复轮、同步阻塞、缺少分阶段反馈等，均有明确改进空间 |

---

## 2. 分析方法（skill 框架）

按 `llm-api-engineering` 分层拆解：

```
Route (FastAPI)
  → Service（prompt 组装、多步 LLM、geocode 编排）
    → LLMClient（OpenAI SDK → DeepSeek）
  → 外部 Geocoding（Photon / Nominatim）
```

性能问题分类：

1. **不可压缩**：LLM 首 token 延迟（TTFT）+ 输出 token 生成时间  
2. **可压缩**：prompt 体积、输出长度上限、模型选型、重复 LLM 轮次  
3. **可异步化**：geocode 串行 HTTP  
4. **体验层**：无 SSE / 无分阶段进度，用户感知「卡住」

---

## 3. 接口耗时瀑布

### 3.1 `POST /api/v1/chat/parse`

```
align_chat_mode（内存，<1ms）
  → 组装 user_payload（内存，<5ms）
  → LLMClient.chat_json_async          ← 通常 8–25s
  → Pydantic 校验
      └─ 失败 → 修复轮 chat_json_async  ← 再 +8–25s
  → process_llm_patches（内存，<5ms）
  → 返回
```

**关键代码**：

```249:263:backend/app/services/chat_parse.py
async def parse_chat_async(req: ChatParseRequest, client: LLMClient) -> ChatParseResponse:
    system = GLOBAL_SYSTEM if req.chat_mode == "global" else SUPPLEMENT_SYSTEM
    user_payload = _build_user_payload(req)
    raw = await client.chat_json_async(system=system, user=user_payload)
    parsed = await _validate_llm_result_async(raw, req.message, client, system)
    ...
```

**无 geocode**：parse 路径 **完全不调用** 地理编码服务。若仍 >10s，**100% 在等 LLM**。

#### parse 输入规模（实测估算）

| 组成部分 | 字符数（约） | 说明 |
|----------|-------------|------|
| `GLOBAL_SYSTEM` | ~1,270 | 含工具白名单 doc + 规则 + JSON 示例 |
| `SUPPLEMENT_SYSTEM` | ~1,380 | 同上，含 add_node 示例 |
| `user_payload`（10 条历史 × 200 字） | ~3,160 | trip_request + chat_history + message |
| **合计 input** | **~4,400 字符 ≈ 1,800–2,200 tokens** | supplement 模式含 itinerary_summary 时更大 |

前端超时：`PARSE_TIMEOUT_MS = 120_000`；后端 LLM client timeout：`120s`。

---

### 3.2 `POST /api/v1/itineraries/generate`

```
generate_itinerary()
  → client.chat_json（sync）              ← 通常 15–60s
  → _llm_to_itinerary（内存，<10ms）
  → geocode_itinerary（串行 HTTP）        ← 通常 +15–40s（可剥离）
  → 返回
```

**关键代码**：

```155:173:backend/app/services/itinerary_llm.py
def generate_itinerary(trip_request: TripRequestIn, client: LLMClient | None) -> dict[str, Any]:
    ...
    raw = client.chat_json(system=ITINERARY_LLM_SYSTEM, user=user, temperature=0.4)
    itinerary = _llm_to_itinerary(raw, trip_request)
    ...
    itinerary = geocode_itinerary(itinerary, dest)
    return itinerary
```

#### generate 无 geocode 时为何仍慢？

关闭 geocode 后，瓶颈只剩 **LLM 生成长 JSON**：

| 因素 | 影响 |
|------|------|
| 默认模型 `deepseek-v4-pro` | Pro 模型推理慢于 flash，适合质量优先场景 |
| 未设置 `max_tokens` | 模型可输出完整 3–6 天 × 3–6 节点 JSON，completion 约 **1,500–4,000 tokens** |
| `temperature=0.4` | 略高于 parse（0.2），输出略长、略慢 |
| **同步 `def` 路由 + sync OpenAI client** | 整段 LLM 等待阻塞 worker 线程（skill 反模式：阻塞 Event Loop） |
| 无流式 / 无 SSE | 必须等 **全部 token 生成完毕** 才返回，TTFT 与总延迟用户均不可见 |

**粗算**：input ~800 tokens + output ~2,500 tokens，Pro 模型 **15–45s** 属正常区间；这与「无 geocode 仍 >10s」完全吻合。

#### geocode 额外耗时（开启时）

```116:131:backend/app/services/geocoding.py
def geocode_itinerary(itinerary, destination):
    for day in itinerary.get("days", []):
        for node in day.get("nodes", []):
            ...
            result = geocode_place(name, dest)   # Photon → Nominatim 瀑布，单次 timeout 15s
            time.sleep(0.3)                      # 每节点固定延迟
```

| 行程规模 | geocode 额外耗时（估算） |
|----------|-------------------------|
| 3 天 × 4 节点 = 12 节点 | 12 × (0.5–2s HTTP + 0.3s sleep) ≈ **10–28s** |
| 5 天 × 5 节点 = 25 节点 | ≈ **20–58s** |

因此 **generate 全链路** 常见为：**LLM 20–40s + geocode 15–30s ≈ 35–70s**。

---

## 4. 根因清单（按贡献度排序）

### P0 · LLM 推理本身（主因，parse & generate 共有）

- 远程 API 往返 + 模型计算，非本地 CPU 瓶颈  
- 当前默认模型链：`deepseek-v4-pro → deepseek-v4-flash → deepseek-chat`（`.env.example`）  
- **parse 与 generate 共用 Pro 模型**，parse 这类抽取任务可用 flash 提速  
- 日志仅有 `latency_ms`，无 `prompt_tokens` / `completion_tokens`，难以量化 TTFT vs 生成长度

### P1 · 可能的第二次 LLM 调用（parse 偶发 ×2）

校验失败触发修复轮（`_validate_llm_result_async`），同一请求 **连续两次** 完整 LLM 调用，延迟接近翻倍。

### P1 · generate 同步 geocode（generate 独有，可剥离）

首次生成强制 `geocode_itinerary()` 后才返回；与「LLM 已完成」相比，geocode 纯增量延迟。

### P2 · 重试叠加（失败场景）

| 层级 | 策略 | 最坏情况 |
|------|------|----------|
| 后端 `LLMClient` | 429/502/503 指数退避，最多 3 次 | 单次 LLM ×3 + sleep(1+2) |
| 前端 `parseChatMessage` | 502/503 再重试 3 次 | 全链路 ×3 |
| 模型 404 回退 | 换 fallback 模型再调 | +一整次 LLM |

正常成功路径不触发；失败时可达 **分钟级**。

### P2 · Prompt 与上下文体积（parse supplement 模式）

- `chat_history` 最多 20 条全量注入  
- supplement 仍注入 `itinerary_summary`（虽已截断，长行程仍大）  
- P80 前端 `compactItineraryForParse` 已瘦身网络 payload，**但后端 prompt 仍用 summary 逻辑**

### P3 · 工程细节

- 每次请求 `new LLMClient()`（`chat.py`），连接复用弱，但相对 10s+ LLM 可忽略  
- `chat_json_async` 重试中使用 `time.sleep` 阻塞 async 事件循环（skill 反模式）  
- generate 路由为同步 `def`，无法与其他请求并发利用 async 优势

---

## 5. 为何「没 geocode 也要 10s+」—— 判定表

| 接口 | 是否调用 geocode | >10s 的原因 |
|------|------------------|-------------|
| `POST /chat/parse` | **否** | 仅 LLM；10–25s 预期内 |
| `POST /itineraries/generate`（若跳过 geocode） | **否** | 仅 LLM 生成长 JSON；15–45s 预期内 |
| `POST /itineraries/generate`（当前默认） | **是** | LLM + 串行 geocode；35–70s+ |
| `POST /itineraries/geocode-nodes` | **是** | 纯 geocode，无 LLM |

**验证方式**：查看后端日志 `llm chat_json ok model=... latency_ms=...`  
- 若 `latency_ms` ≈ 接口总耗时 → 瓶颈在 LLM  
- 若 LLM 8s、接口 35s → 瓶颈在 geocode

---

## 6. 优化方案

### 6.1 generate 首次 geocode 异步化（推荐，P0）

**目标**：首包只返回 LLM 行程（`lat/lng=0`），geocode 后台补全，首屏时间 ≈ **纯 LLM 耗时**。

**现状资产**（可直接复用）：

- 节点初始 `lat/lng=0`、`coord_confidence: none`（`_llm_to_itinerary` 已如此）  
- 独立接口 `POST /api/v1/itineraries/geocode-nodes`（P86）  
- 前端 `geocodeItineraryNodes()`、`usePlanStore.confirmPatches` 已有异步 geocode 模式  
- 地图层可展示无坐标节点（用户手动搜索补码）

**推荐方案 A：请求参数控制（改动最小）**

```python
# schemas/itinerary.py
class GenerateItineraryRequest(BaseModel):
    trip_request: TripRequestIn
    geocode: bool = False   # 默认 False，首包快速返回

# itinerary_llm.py
if body.geocode:
    itinerary = geocode_itinerary(itinerary, dest)
```

前端 `generateItinerary` 成功后 **fire-and-forget**：

```typescript
const itinerary = await generateItinerary(tripRequest, { geocode: false });
setItinerary(itinerary);
void geocodeItineraryNodes(itinerary, destination).then(setItinerary);
```

**推荐方案 B：SSE 分阶段（skill 推荐，体验最佳）**

```
event: progress
data: {"step": "llm", "status": "done", "latency_ms": 18000}

event: progress
data: {"step": "geocoding", "done": 3, "total": 12}

event: result
data: {"itinerary": {...}}
```

- 首阶段 LLM 完成后即可渲染路线图（无坐标）  
- geocode 进度可驱动地图逐点更新  
- 符合 `llm-api-engineering`「生成长文本优先 SSE」约定

**产品注意**：异步 geocode 期间地图标点可能暂缺坐标，需在 UI 显示「坐标补全中…」（可与 `ChatStatusBar` 模式统一）。

---

### 6.2 模型分级（P0，立竿见影）

| 接口 | 当前 | 建议 | 预期收益 |
|------|------|------|----------|
| `parse` | `deepseek-v4-pro` | `deepseek-v4-flash` 或 `LLM_MODEL_REWRITE` | 延迟 **−30~50%**，质量对抽取任务足够 |
| `generate` | `deepseek-v4-pro` | 保持 Pro，或 A/B flash | 质量/速度权衡 |
| 修复轮 | 同主模型 | 固定 flash | 降低偶发 ×2 延迟 |

实现：`LLMClient.chat_json_async(..., model=settings.llm_model_rewrite)` 或在 Settings 增加 `llm_model_parse`。

---

### 6.3 限制输出长度 `max_tokens`（P1）

当前 **未设置 `max_tokens`**，generate 输出不可控。

| 接口 | 建议 max_tokens | 理由 |
|------|-----------------|------|
| parse | 800–1,200 | reply + 少量 patches |
| generate | 2,500–3,500 | 3 天 × 5 节点 JSON 上限 |

可显著减少「模型啰嗦」导致的尾部延迟。

---

### 6.4 减少 parse 修复轮（P1）

- 加强 system prompt 示例与 `response_format: json_object`（已启用）  
- 修复轮改用更小 prompt（仅错误 + 原 message，不带完整 history）  
- 记录修复轮触发率；>5% 时应优化 prompt 而非依赖修复

---

### 6.5 geocode 工程优化（P1，适用于异步后置路径）

| 项 | 现状 | 建议 |
|----|------|------|
| 并发 | 逐节点串行 | `asyncio.gather` + `Semaphore(3~5)` 限流 |
| 延迟 | 每节点 `sleep(0.3)` | 保留限流但改为 token bucket，或仅 Nominatim 路径 sleep |
| 缓存 | 无 | 同 `(name, destination)` 内存 LRU，避免重复搜索 |
| 短路 | 每次全量 | 跳过已有 `coord_confidence in (high, manual)` 的节点（已实现） |

预计 geocode 12 节点：**28s → 5–8s**（并行 + 缓存）。

---

### 6.6 路由 async 化（P2）

```python
# 现状
@router.post("/generate")
def generate_itinerary_endpoint(...):  # sync，阻塞 worker

# 建议
@router.post("/generate")
async def generate_itinerary_endpoint(...):
    raw = await client.chat_json_async(...)
```

- generate 改用 `chat_json_async`  
- geocode 改用 `httpx.AsyncClient`  
- 避免 sync 调用占满 FastAPI worker pool

---

### 6.7 可观测性（P2，定位必备）

按 skill 要求，每次 LLM 调用记录：

```python
logger.info(
    "llm ok model=%s latency_ms=%s prompt_tokens=%s completion_tokens=%s endpoint=%s",
    model, latency_ms,
    resp.usage.prompt_tokens,
    resp.usage.completion_tokens,
    "parse" | "generate",
)
```

响应可选返回 `meta.latency_ms` / `meta.geocode_ms` 供前端展示。

---

### 6.8 体验层（P2）

| 项 | 说明 |
|----|------|
| parse 阶段 hint | 已有 30s 升级 hint（P84）；可加「预计 10–20s」初始文案 |
| generate 进度 | `isGeneratingItinerary` + 分阶段文案（LLM / 坐标补全） |
| 流式 cursor | parse 非流式可接受；generate 建议 SSE |

---

## 7. 优化优先级与预期收益

| 优先级 | 措施 | 影响接口 | 实施成本 | 首包延迟预期 |
|--------|------|----------|----------|--------------|
| **P0** | generate geocode 异步后置 | generate | 低 | **35–70s → 15–40s** |
| **P0** | parse 换 flash 模型 | parse | 极低 | **15–25s → 8–15s** |
| **P1** | 设置 max_tokens | 两者 | 低 | −10~25% |
| **P1** | geocode 并行 + 缓存 | geocode-nodes | 中 | geocode **−60~70%** |
| **P1** | 修复轮 prompt 瘦身 | parse | 低 | 偶发 −50% |
| **P2** | generate SSE 分阶段 | generate | 中 | 体感显著提升 |
| **P2** | async 路由 + async geocode | generate | 中 | 吞吐 ↑，单请求略降 |
| **P3** | 请求级 LLMClient 复用 | 两者 | 低 | <100ms |

---

## 8. 建议实施顺序

```
Phase 1（1–2h，无协议Breaking）
  1. parse 默认 flash 模型
  2. generate 增加 geocode=false 默认 + 前端异步 geocode-nodes
  3. 补充 latency / token 日志

Phase 2（半天）
  4. max_tokens 限制
  5. geocode 并行 + 内存缓存
  6. generate 改 async

Phase 3（1–2天，体验升级）
  7. generate SSE（llm_done → geocode_progress → result）
  8. 前端分阶段进度 UI
```

---

## 9. 关联代码索引

| 文件 | 职责 |
|------|------|
| `backend/app/services/llm_client.py` | LLM 超时 120s、重试、模型链 |
| `backend/app/services/chat_parse.py` | parse prompt、修复轮 |
| `backend/app/services/itinerary_llm.py` | generate LLM + geocode 串联 |
| `backend/app/services/geocoding.py` | 串行 geocode + sleep(0.3) |
| `backend/app/api/v1/itineraries.py` | generate / geocode-nodes 路由 |
| `frontend/src/api/chat.ts` | parse 120s 超时、502/503 重试 |
| `frontend/src/api/itinerary.ts` | generate / geocode-nodes 客户端 + SSE 流 |
| `frontend/src/utils/parseSse.ts` | SSE 解析与消费 |
| `frontend/src/stores/usePlanStore.ts` | 自动 generate、add_node 后 geocode、`generationProgress` |
| `backend/app/utils/sse.py` | SSE 事件格式化 |

---

## 10. 开放决策

| # | 问题 | 结论 |
|---|------|------|
| D1 | 首次 generate 是否默认跳过 geocode | ✅ **是** — `geocode:false` 默认，前端异步补全 |
| D2 | parse 是否永久使用 flash | ✅ **是** — `LLM_MODEL_REWRITE` |
| D3 | geocode 并行度 | ✅ **4** — `GEOCODE_MAX_WORKERS` |

---

## 11. 已实施优化（2026-06-29）

| Phase | 项 | 状态 |
|-------|-----|------|
| 1 | parse 默认 flash 模型 | ✅ |
| 1 | generate `geocode:false` + 前端异步 geocode | ✅ |
| 1 | latency / token 日志 | ✅ |
| 2 | max_tokens 限制 | ✅ |
| 2 | geocode 并行 + 内存缓存 | ✅ |
| 2 | generate 改 async | ✅ |
| 2 | parse 耗时预期 hint + 坐标补全状态条 | ✅ |
| 3 | generate SSE 分阶段 | ✅ |
| 3 | 前端分阶段进度 UI（LLM ms 展示） | ✅ |
| 3 | parse LLM token 流式（reply 打字机） | ✅ |

### 预期收益（实施后）

| 接口 | 优化前 | 优化后（估算） |
|------|--------|----------------|
| parse | 15–25s | **8–15s**（flash + max_tokens） |
| generate 首包 | 35–70s | **15–40s**（跳过同步 geocode） |
| geocode-nodes | 20–30s | **5–10s**（并行 + 缓存） |

### Phase 3 新增接口

| 接口 | 说明 |
|------|------|
| `POST /api/v1/itineraries/generate/stream` | SSE：`progress(llm)` → `result`；15s 心跳 |
| `POST /api/v1/itineraries/geocode-nodes/stream` | SSE：`progress(geocoding, done/total)` → `result` |
| `POST /api/v1/chat/parse/stream` | SSE：`delta(reply_preview)` → `result`（P99） |

原 JSON 接口保留作 fallback。

---

*最后更新：2026-06-29 · Phase 1–3 全部落地，含 P99 parse token 流式*
