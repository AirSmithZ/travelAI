# 生成与 LLM

> 行程生成、截断修复、thinking、Mock、玩法 CTA

← [问题日志总览](./README.md)

---

<a id="p96"></a>

### P96 · parse 未关 thinking 导致空 content（2026-08-09）✅

**现象**：对话 parse SSE 出现 `validate/fixing` 后报错「请增大 LLM_MAX_TOKENS_GENERATE」；reasoning 实为抽表单/patches，非行程生成。日志：`parse_stream … finish_reason=length completion_tokens=2500 content_chars=0`。

**根因**：P93 只给 **generate** 关了 `thinking`；`chat_parse` 仍默认开启，reasoning 吃光 `LLM_MAX_TOKENS_PARSE`；空 content 文案写死 GENERATE 造成误诊。与 P94/P95 无关。

**修复**：parse / parse_stream / parse_fix* 一律 `thinking=False`；空 content 按 endpoint 提示 `LLM_MAX_TOKENS_PARSE` 或 `GENERATE`。

**主键文件**：`chat_parse.py` · `llm_client.py`

---

---

<a id="p95"></a>

### P95 · 景点餐饮停留量级无品类默认（2026-08-09）✅

**现象**：非机酒节点 `start/end` 几乎全由 LLM 填写，可出现餐厅排 4 小时、景点只排 10 分钟等量级离谱；不宜用 Tavily 再搜验时（臃肿且不准）。

**根因**：无品类停留先验；P94 接龙只保机酒自洽，保留 LLM 原时长。

**修复（L1）**

| 层 | 改动 |
|----|------|
| `visit_duration.py` | 品类 `(min, typical, max)` 表；`apply_category_duration_clamp`（跳过航班钉机场与过夜酒店） |
| `intel_anchor_enforce` | `hotels → flights → clamp → cascade` |
| `itinerary_llm` | USER 注入同表 `VISIT_DURATION`；system 规则 20 |

**验收**：`python backend/scripts/test_visit_duration.py` · `test_intel_anchor_enforce.py`

**说明**：非营业时间真相源；玩法印证仍只做「去哪」，不做无目的搜时校验。

---

---

<a id="p93"></a>

### P93 · thinking 截断 + 前端假完成「正在写入」（2026-08-09）✅

**现象**：SSE `completion_tokens=8000`、`content_chars=0`、`validate/fixing`；UI 显示「AI 生成完成，正在写入…」像卡住。

**根因**：DeepSeek V4 默认 thinking，与 content 共用 `max_tokens`；前端在 `phase=llm` 且已有耗时就写「生成完成」。

**修复**：generate/fix 传 `thinking: disabled`；截断修复改用 flash；前端识别 `validate` →「正在修复校验…」，不再假完成。

**主键文件**：`llm_client.py` · `itinerary_llm.py` · `ChatStatusBar.tsx` · `usePlanStore.ts`

---

---

<a id="p91"></a>

### P91 · generate 失败静默 Mock 掩盖真实错误（2026-08-09）✅

**现象**：SSE `error` 后界面仍出现「新加坡样例」行程，与用户输入完全不符，且难以对照后端错误排查。

**根因**：`usePlanStore.generateItinerary` 在 `catch` 中对 `mode===generate` 调用 `buildMockItinerary` 并写入计划。

**修复**：失败时 **不写行程**；toast + Activity 展示 SSE/`Error.message`；返回 `'error'`（保留显式 `generateMockItinerary` 仅作开发入口）。

**主键文件**：`usePlanStore.ts` · `ReadinessChecklist.tsx`

---

---

<a id="p90"></a>

### P90 · generate/stream 截断后 `_LLMItinerary.title` missing（2026-08-09）✅

**现象**：SSE `llm` 完成（`completion_tokens≈3500`）→ 两次 `validate/fixing` → `error: Field required title … input_value={}`。

**根因**

1. 默认 `LLM_MAX_TOKENS_GENERATE=3500`，4 日行程 + reasoning 模型易 `finish_reason=length`，流式 `content` 为空  
2. `chat_json*` 用 `content or "{}"` 把空回复当成合法 JSON  
3. 修复轮仍打满 token，再次得到 `{}`；Pydantic 报缺 `title`（表象）  
4. Prompt「每天 6–9 节点」与修复提示「3–6」不一致，输出偏胖

**修复（llm-api-engineering）**

| 层 | 改动 |
|----|------|
| 配置 | 默认 generate `max_tokens` → **8000**（`.env.example` 同步） |
| LLMClient | 空 content **抛错**，记录 `finish_reason`；禁止 `or "{}"` |
| Prompt | 每天 **4–6** 节点；禁止空对象 `{}` |
| 修复轮 | 与主生成同档 token；截断提示要求短完整 JSON；**最多 1 次**修复；`_require_itinerary_raw` 拒绝 `{}`/缺 title |

**验收**：`python backend/scripts/test_itinerary_llm_tokens.py` · 重启 backend 后重新 generate（若 `.env` 曾写死 3500 需改为 ≥8000）

**主键文件**：`llm_client.py` · `itinerary_llm.py` · `config.py`

---

---

<a id="p80"></a>

### P80 · 生成忽略用户确认酒店（2026-08-09）✅

**现象**：用户已确认/添加的酒店，生成后的行程晚宿是模型另造的酒店名；Stay 面板与路线图不一致。航班/片区有同类「只靠 prompt」风险。

**根因（非「没传 travel_intel」）**

1. HARD 文案只要求「靠近/体现片区」，未要求 **exact hotel name**
2. `_llm_to_itinerary` 原样接受模型编造的 hotel 节点，**无确定性合并**
3. 生成只替换 `itinerary`，`travel_intel.hotels.itinerary_node_id` 变 stale
4. 未确认的 proposed 片区曾被塞进 HARD，与用户酒店争抢

**修复**

| 层 | 改动 |
|----|------|
| Prompt | confirmed_hotels 必须同名；仅 confirmed zones 进 HARD；optimize 不得保留冲突酒店 |
| 后处理 | `intel_anchor_enforce.enforce_confirmed_hotels`：改名/注入/剔除编造晚宿 + `meta.hotel_bindings` |
| 前端 | `rebindHotelsAfterGenerate` 同步 `travel_intel.hotels` |

**验收**：`python backend/scripts/test_intel_anchor_enforce.py`

---

---
