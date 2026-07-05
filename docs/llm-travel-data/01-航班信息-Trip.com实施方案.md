# 航班信息 — Trip.com 方案生产实施方案

← [返回索引](./README.md) · 前置：[01-航班信息.md](./01-航班信息.md) · [Spike 验证报告](./01-航班信息-Spike验证报告.md) · [Ignav 验证方案](./01-航班信息-Ignav验证方案.md)

> **版本**：v1.1 · **日期**：2026-07-02  
> **适用范围**：**私人行程规划** · **中国出发** · **不在 App 内订票**  
> **数据源决策**：**Ignav REST（App 内查价，已验证 Go）** · Trip.com `showfarefirst` Deep Link（**预订 CTA**）· LetsFG（fallback）· **不用** Duffel / Apify / Google Flights 主入口

---

## 1. 目标与边界

### 1.1 要做什么

| 能力 | 说明 |
|------|------|
| 解析意图 | LLM 从对话/表单得到出发地、目的地、日期、人数、偏好 |
| 购买入口 | 生成 Trip.com 预填 **航线 + 日期** 的链接，用户**确认预订**时外链 |
| App 内查价 | **Ignav API** 返回结构化报价供 rank + LLM 分析（Phase 1.6，见 [Ignav 方案](./01-航班信息-Ignav验证方案.md)） |
| 可选参考价 | LetsFG 异步（fallback）；`confidence: medium` |
| 推荐解释 | LLM 基于工具 JSON 解释「为何推荐」，**禁止编造票价** |
| 写进行程 | 绑定 `flight_quote_id` 或 `purchase_url` 到 `airport` 节点 |

### 1.2 不做什么

- 不在 App 内支付、出票  
- 不依赖 Duffel / 携程 Partner API 2.0 / Apify 爬虫  
- 不承诺「此价可订」— 仅「有官方购买路径 + 以外链实时为准」  
- 联盟佣金 **非** 功能前提（私人自用可不开 `Allianceid`，见 §4.3）

### 1.3 成功标准（验收）

- [x] 用户说「10/16 上海飞新加坡」→ 10s 内得到 Trip.com 链接（含 `ddate`）  
- [ ] 链接无痕打开：上海→新加坡、日期正确（需人工确认）  
- [x] API 返回必有 `purchase.url`  
- [x] LetsFG 在验证页路径默认开启（`verify-from-text`）；`/search` 需 `include_letsfg=true` 或 `FLIGHT_INCLUDE_LETSFG=true`  
- [x] 响应含 `fetched_at`、免责 `warnings`  

---

## 2. 总体架构

```
用户对话 / 表单 (TripRequest)
        ↓
Planner / Chat Agent（LLM）
        ↓  Tool Calling
┌───────────────────────────────────────┐
│  search_flights(request)              │
│    ├─ ignav_provider.py   → offers[]（Phase 1.6，App 内查价）│
│    ├─ tripcom_deeplink.py → purchase.url（预订 CTA，<50ms）   │
│    └─ letsfg_provider.py  → offers[]（可选 fallback，异步）   │
└───────────────────────────────────────┘
        ↓
rank + validate（若有 offers）
        ↓
FlightSearchResult JSON 回灌 LLM
        ↓
reply + patches / 写入 Itinerary.meta.flight_quotes[]
        ↓
前端：App 内推荐卡片 +「前往 Trip.com 确认预订」
```

与 [00-概述与架构.md](./00-概述与架构.md) 一致：**查价走代码，分析走 LLM**。

---

## 3. Trip.com 链接规范（已验证）

### 3.1 标准 URL 模板

**单程 · 中国出发（推荐）**：

```text
https://www.trip.com/flights/showfarefirst
  ?dcity={city_code_lower}
  &acity={city_code_lower}
  &ddate={YYYY-MM-DD}
  &triptype=ow
  &class=y
  &quantity={adults}
  &curr=CNY
```

**往返**（需实测后启用）：

```text
&triptype=rt&ddate={去程}&rdate={回程}
```

### 3.2 已验证示例

上海→新加坡，2026-08-19（[页面显示 Aug 19](https://www.trip.com/flights/showfarefirst?dcity=sha&acity=sin&ddate=2026-08-19&triptype=ow&class=y&quantity=1&curr=CNY)）：

```text
https://www.trip.com/flights/showfarefirst?dcity=sha&acity=sin&ddate=2026-08-19&triptype=ow&class=y&quantity=1&curr=CNY
```

### 3.3 禁止 / 慎用

| 项 | 原因 |
|----|------|
| `trip_sub1=日期` | Sub ID 仅追踪，**不预填搜索日期** |
| `tickets-SHA-SIN` 无 `ddate` | 无法固定出发日 |
| `triptype=ow` 同时带 `rdate` | 参数矛盾，应删 `rdate` |
| 首页 `/?Allianceid=...` | 不预填航线 |

### 3.4 联盟参数（可选）

私人自用 **功能不依赖**；若已注册 [Trip.com Affiliate](https://www.trip.com/partners/index)，可追加：

```text
&Allianceid=9000545&SID=322318060&trip_sub3=D18383577&trip_sub1={campaign_tag}
```

- `trip_sub1`：自定义追踪（如 `app_flight`），**不是日期**  
- 配置化写入 `.env`，勿硬编码到公开仓库  

### 3.5 城市码映射

Trip.com 使用 **城市码**（常小写），与机场 IATA 可能不同：

| 用户说法 | `dcity` / `acity` | 备注 |
|----------|-------------------|------|
| 上海 | `sha` | 含浦东/虹桥 |
| 新加坡 | `sin` | |
| 北京 | `bjs` | |
| 东京 | `tyo` | |
| 香港 | `hkg` | |

**实现**：维护 `flight_spike/fixtures/city_codes.json` 或 `backend/.../city_codes.json`；未知城市 → LLM 澄清或 `resolve_place` 后查表。

---

## 4. 数据模型

### 4.1 FlightSearchRequest

```typescript
interface FlightSearchRequest {
  origin: string;       // 城市码或 IATA，内部 normalize
  destination: string;
  date: string;         // YYYY-MM-DD
  return_date?: string;
  adults?: number;      // default 1
  cabin?: 'economy' | 'premium_economy' | 'business' | 'first';
  preference?: 'cheap' | 'fast' | 'balanced';
  include_letsfg?: boolean;  // default false（私人版）；true 开启参考价
}
```

### 4.2 FlightSearchResult

```typescript
interface PurchaseChannel {
  name: 'Trip.com';
  url: string;
  type: 'search';
  note: string;
}

interface FlightSearchResult {
  request: FlightSearchRequest;
  fetched_at: string;
  purchase: PurchaseChannel;      // 必有
  offers: FlightQuote[];          // LetsFG，可空
  ranked: FlightQuote[];          // 可空
  sources_used: ('tripcom_deeplink' | 'letsfg')[];
  warnings: string[];
  errors: Record<string, string>;
}
```

### 4.3 FlightQuote（LetsFG 有数据时）

沿用 [01-航班信息.md §3](./01-航班信息.md#3-比价-schema)，补充：

```typescript
interface FlightQuote {
  // ...existing fields
  purchase_url: string;           // 同 FlightSearchResult.purchase.url
  confidence: 'medium';           // LetsFG 固定 medium
  bookability: 'search_link';     // 以外链为准
}
```

**硬规则**：`ranked[]` 每条必须带 `purchase_url`；无 LetsFG 时整单仅返回 `purchase` + 警告。

---

## 5. 后端实施

### 5.1 目录（迁入 travel 主项目）

```
backend/app/services/flight/
├── __init__.py
├── provider.py           # Protocol: search(req) -> FlightSearchResult
├── tripcom_deeplink.py   # showfarefirst URL 构建（P0）
├── city_codes.py         # 城市名/IATA → dcity/acity
├── letsfg_provider.py    # 从 flight-spike 迁入（P1，可选）
├── rank.py               # 从 flight-spike 迁入
├── validate.py           # 价格/时长/航线 sanity check（P1）
└── normalize.py        # 统一 FlightQuote
```

### 5.2 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/flights/search` | 入参 `FlightSearchRequest`，返回 `FlightSearchResult` |
| — | 不写入 Itinerary | 搜索与生成解耦；确认后 Patch |

**请求示例**：

```json
{
  "origin": "SHA",
  "destination": "SIN",
  "date": "2026-10-16",
  "adults": 1,
  "preference": "balanced",
  "include_letsfg": false
}
```

**响应示例（私人版默认，仅 Trip.com）**：

```json
{
  "fetched_at": "2026-07-01T12:00:00Z",
  "purchase": {
    "name": "Trip.com",
    "url": "https://www.trip.com/flights/showfarefirst?dcity=sha&acity=sin&ddate=2026-10-16&triptype=ow&class=y&quantity=1&curr=CNY",
    "type": "search",
    "note": "航班与价格以 Trip.com 预订页为准"
  },
  "offers": [],
  "ranked": [],
  "sources_used": ["tripcom_deeplink"],
  "warnings": ["未启用参考价源；请在 Trip.com 查看具体航班与实时价格"]
}
```

### 5.3 环境变量

```bash
# Trip.com（可选联盟）
TRIPCOM_AFFILIATE_ALLIANCE_ID=          # 私人可留空
TRIPCOM_AFFILIATE_SID=
TRIPCOM_AFFILIATE_SUB3=
TRIPCOM_DEFAULT_CURRENCY=CNY

# LetsFG（可选）
FLIGHT_INCLUDE_LETSFG=false
FLIGHT_LETSFG_TIMEOUT_SEC=300

# 通用
FLIGHT_DEFAULT_PREFERENCE=balanced
```

### 5.4 LLM Tool：`search_flights`

注册于 Chat / Itinerary Agent（见 `llm-api-engineering` Skill）：

**System 硬约束**：

1. 调用 `search_flights` 后再推荐航班；不得编造价格/航班号  
2. 无 `ranked` 时：输出航线/日期/偏好说明 + `purchase.url`  
3. 有 `ranked` 时：只引用返回的 `id`，并附 `purchase.url`  
4. 必须向用户说明：「以 Trip.com 预订页为准」  

**与行程生成并行**：

- `POST /itineraries/generate` **不**同步等待 LetsFG  
- 航班链接可在 Chat 中即时返回；LetsFG 走独立请求或 SSE 补丁  

---

## 6. 前端实施

### 6.1 展示（Chat / 行程卡片）

**最小 UI（P0）**：

```
✈ 上海 → 新加坡 · 2026-10-16 · 1 人
[ 前往 Trip.com 查看并预订 ]
航班与价格以 Trip.com 实时页面为准。
```

**完整 UI（P1，有 LetsFG）**：

```
推荐 #1  新航  08:05→13:20  直飞  参考价 USD 312  [medium]
        前往 Trip.com 预订 →
```

### 6.2 Itinerary 映射

扩展 `ItineraryMeta`（见 00-概述）：

```typescript
meta: {
  flight_quotes?: FlightQuote[];
  flight_purchase?: PurchaseChannel;
  provenance?: [{ source: 'tripcom_deeplink', confidence: 'high', fetched_at: '...' }];
}
```

`airport` 节点 `metadata.purchase_url` 或 `flight_quote_id`。

---

## 7. 分阶段实施计划

### Phase 0 — 文档与 Spike 对齐（0.5 天）✅

- [x] Trip.com `showfarefirst + ddate` 验证  
- [x] Affiliate 能力边界明确  
- [x] 本方案评审通过  

### Phase 1 — Trip.com Deep Link 接入（1～2 天）✅ **已完成 2026-07-01**

| 任务 | 产出 | 状态 |
|------|------|------|
| `tripcom_deeplink.py` | URL 构建 | ✅ `backend/app/services/flight/` + `flight-spike/` |
| `city_codes.json` | 中英/IATA → Trip.com 码 | ✅ 28 城市 |
| `POST /api/v1/flights/search` | 仅 Trip.com | ✅ |
| 单元测试 | T1～T3 | ✅ `backend/scripts/test_flight_tripcom.py` |

**调用示例**：

```bash
curl -s -X POST http://localhost:8000/api/v1/flights/search \
  -H 'Content-Type: application/json' \
  -d '{"origin":"SHA","destination":"SIN","date":"2026-10-16"}' | jq .purchase.url
```

**不含**（留后续 Phase）：LetsFG、LLM Tool、主 App 内嵌 UI。

### Phase 1.5 — API 验证页（开发用，非正式功能）✅

航班能力**尚未接入**主 App 对话/行程编辑，避免与正在验证的方案混淆。

| 方式 | 用途 |
|------|------|
| `curl` / `test_flight_tripcom.py` | 自动化断言 URL 参数 |
| **`frontend/flight-verify.html`** | 自然语言 → LLM 解析 → LetsFG 参考价 + 排序 + LLM 推荐；Trip.com 作次要预订入口 |

**启动验证页**（需 backend + frontend 同时运行）：

```bash
# 终端 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 终端 2
cd frontend && npm run dev
# 打开 http://localhost:5173/flight-verify.html
```

填写自然语言需求 → 点击「发送」→ 检查 LLM 解析、Trip.com 链接与 JSON。

### Phase 1.6 — Ignav App 内查价 ✅ **Spike Go 2026-07-03**

| 任务 | 产出 | 状态 |
|------|------|------|
| `flight_spike/ignav.py` | API 客户端 + normalize | ✅ |
| `scripts/tier15_ignav.py` | fixtures 三线验证 | ✅ **3/3** |
| 验证报告 | [Ignav 验证报告](./01-航班信息-Ignav验证报告.md) | ✅ |
| 迁入 `backend/.../ignav_provider.py` | 验证通过后 | ✅ **2026-07-03** |
| `search.py` 默认 Ignav + LetsFG fallback | P1 | ✅ |
| 单元测试 `test_flight_ignav_parse.py` | 无网络 normalize | ✅ |

### Phase 2 — 接入主 App（阶段 B 航班 ✅ 2026-07-03）

| 任务 | 产出 | 状态 |
|------|------|------|
| `TravelIntel` + store | `travel_intel` 持久化 v3 | ✅ |
| `FlightIntelPanel` | Chat 侧栏搜选确认 | ✅ |
| Chat Tool `search_flights` | 对话中按需触发 | ⏳ |
| Prompt 分支 + 硬约束 | 禁止编价 | ⏳ |
| generate 读 `travel_intel` | P4 硬约束锚点 | ⏳ |
| Itinerary meta 写入 | 可选绑定 | ⏳ |

### Phase 3 — LetsFG 参考价（验证页已接入 ✅ / 主 App 待做）

| 任务 | 产出 | 状态 |
|------|------|------|
| 迁入 `letsfg_provider` + `rank` | backend `search` + verify 路径 | ✅ |
| LLM 推荐分析 | `intent_parse._recommend_offers` | ✅ 验证页 |
| `validate.py` | 过滤无效 offer | ⏭ 可选 |
| 主 App 接入 | CTA + itinerary meta | 待做 |

### Phase 4 — 打磨（按需）

- 联盟参数配置化  
- 往返 `triptype=rt` 实测  
- 缓存 15～30min（同航线）  
- 多机场澄清（浦东 vs 虹桥）  

---

## 8. 测试用例

| # | 输入 | 期望 |
|---|------|------|
| T1 | SHA→SIN, 2026-10-16 | URL 含 `dcity=sha&acity=sin&ddate=2026-10-16` |
| T2 | 上海→新加坡（中文） | normalize → sha/sin |
| T3 | 无效日期 | 422 |
| T4 | LetsFG 超时 | 200 + 仅 purchase + warnings |
| T5 | LLM 对话「便宜优先」 | 调用 tool，回复含 Trip.com 链接，无虚构价格 |

**手工**：无痕打开 `purchase.url`，确认航线与日期。

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| Trip.com URL 改版 | 集成测试 + 保留 `showfarefirst` 快照断言 |
| 城市码错误 | 查表 + LLM 澄清 |
| LetsFG 慢/挂 | 默认关闭；异步 + 降级 |
| LLM 编造航班 | Tool-only 推荐 + 422/审计 |
| 联盟参数泄露 | `.env` + `.gitignore` |

---

## 10. 与既有文档关系

| 文档 | 变更 |
|------|------|
| [01-航班信息.md](./01-航班信息.md) | §4 Phase 1 主入口改为 Trip.com（待补链接） |
| [Spike 验证报告](./01-航班信息-Spike验证报告.md) | Tier0 保留；GF 降为备选 |
| `flight-spike/` | Phase 1 前保留；`tripcom_deeplink` 可先在此实现再迁入 |

---

## 11. 立即行动清单（Phase 1 开工）

1. ~~确认 `.env` 是否配置联盟 ID（可空）~~ ✅  
2. ~~实现 `build_tripcom_flight_url(req)`~~ ✅  
3. ~~添加 `city_codes.json`~~ ✅  
4. ~~暴露 `POST /api/v1/flights/search`~~ ✅  
5. ~~T1～T3 自动化~~ ✅ · 无痕手工验链接（待做）  

### Phase 2 下一步（待做，验证通过后再接主 App）

1. Chat Tool `search_flights` 对接 `/api/v1/flights/search`  
2. 主 App「前往 Trip.com 预订」按钮  
3. Prompt 硬约束（禁止编价）  

**当前验证**：用 `flight-verify.html` 或 curl，确认 API 返回后再做上述集成。

---

## 12. 已实现文件索引

### Phase 1

```
backend/app/services/flight/
├── tripcom_deeplink.py
├── city_codes.py
├── search.py
└── data/city_codes.json
backend/app/schemas/flight.py
backend/app/api/v1/flights.py
backend/scripts/test_flight_tripcom.py
flight-spike/flight_spike/tripcom_deeplink.py   # CLI 同步
```

### 验证工具（Phase 1.5，非主 App）

```
frontend/flight-verify.html
frontend/src/dev/FlightVerifyApp.tsx
frontend/src/api/flights.ts
frontend/src/types/flight.ts
backend/app/services/flight/intent_parse.py
backend/app/services/flight/letsfg_provider.py
backend/app/services/flight/rank.py
backend/app/api/v1/flights.py          # POST /verify-from-text
backend/scripts/test_flight_intent_parse.py
backend/scripts/test_flight_letsfg_parse.py
backend/scripts/test_flight_rank.py
```

---

### Ignav Spike（Tier 1.5，flight-spike）

```
flight-spike/flight_spike/ignav.py
flight-spike/scripts/tier15_ignav.py
docs/llm-travel-data/01-航班信息-Ignav验证方案.md
docs/llm-travel-data/01-航班信息-Ignav验证报告.md
```

---

*私人行程规划 · Trip.com 预订 + Ignav 查价 · Phase 1 + 验证页 + Ignav Spike · 2026-07-02*
