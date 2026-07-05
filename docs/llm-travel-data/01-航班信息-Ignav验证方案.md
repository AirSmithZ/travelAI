# 航班信息 — Ignav API 验证方案

← [返回 01-航班信息](./01-航班信息.md) · 前置：[Spike 验证报告](./01-航班信息-Spike验证报告.md) · [Trip.com 实施方案](./01-航班信息-Trip.com实施方案.md)

> **版本**：v1.0 · **日期**：2026-07-02  
> **目标**：验证 Ignav 能否为 LLM 提供**结构化航班报价**（App 内分析，用户无需跳转查价）  
> **Spike 代码**：`flight-spike/flight_spike/ignav.py` · `flight-spike/scripts/tier15_ignav.py`

---

## 1. 背景与动机

Phase 1（Trip.com Deep Link）只能生成购买入口，**无法在 App 内给 LLM 结构化数据**。LetsFG 本地 CLI 慢（≈158s）、成功率低（1/3），且依赖 Playwright。

**Ignav**（[ignav.com](https://ignav.com/)）定位为 AI Travel Tools 的自助 REST API：

| 项 | 说明 |
|----|------|
| 注册 | 免费自助，即时 API Key |
| 额度 | 1000 次成功请求免费，之后 $2/1000 次 |
| 延迟 | 文档未承诺 SLA；REST 同步，预期秒级～数十秒 |
| 输出 | `itineraries[]`：价格、航司、航段、时长、经停 |
| 预订 | 搜索不含 booking URL；需二次调用 `POST /api/fares/booking-links` |
| MCP | `https://ignav.com/mcp`（可选） |

与 travel 项目的关系：**Ignav 负责「查价 + LLM 分析」；Trip.com Deep Link 仍作中国出发用户的「确认预订」入口（可并存）。**

---

## 2. 验证范围

### 2.1 测试航线（与 Spike fixtures 一致）

| id | 航线 | 日期 | 类型 |
|----|------|------|------|
| `asia-short` | PVG→SIN | 2026-10-16 | 单程 |
| `asia-hub` | HKG→NRT | 2026-11-01 / 2026-11-08 | 往返 |
| `duffel-sandbox` | LHR→JFK | 2026-07-15 | 单程（欧美对照） |

### 2.2 通过标准

| 指标 | 阈值 |
|------|------|
| API 连通 | 401（无 Key）或 200（有 Key）可区分 |
| 结构化报价 | ≥1 条航线返回 `itineraries` 且可映射 `FlightQuote` |
| 延迟 | 记录 P50；若 P95 >30s 需异步包装 |
| 预订链接 | 最便宜 offer 可拿到 `booking-links`（可选） |
| LLM 可用性 | `ranked_preview` ≥3 条时可驱动推荐 Prompt |

### 2.3 不验证

- App 内支付 / 出票  
- 与 Trip.com 页面价逐分一致  
- 往返 HKG↔NRT 若 API 参数限制则单独记录  

---

## 3. API 契约摘要

### 3.1 认证

```http
X-Api-Key: YOUR_API_KEY
```

注册：[https://ignav.com/](https://ignav.com/) → Dashboard 复制 Key。

### 3.2 单程搜索

```bash
curl -X POST "https://ignav.com/api/fares/one-way" \
  -H "X-Api-Key: $IGNAV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"origin":"PVG","destination":"SIN","departure_date":"2026-10-16","adults":1,"cabin_class":"economy"}'
```

### 3.3 往返搜索

```bash
curl -X POST "https://ignav.com/api/fares/round-trip" \
  -H "X-Api-Key: $IGNAV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"origin":"HKG","destination":"NRT","departure_date":"2026-11-01","return_date":"2026-11-08","adults":2,"cabin_class":"economy"}'
```

### 3.4 预订链接（搜索后）

```bash
curl -X POST "https://ignav.com/api/fares/booking-links" \
  -H "X-Api-Key: $IGNAV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ignav_id":"<from itinerary>"}'
```

### 3.5 映射到 `FlightQuote`

| Ignav 字段 | `FlightQuote` |
|------------|---------------|
| `outbound.carrier` | `airline` |
| `outbound.segments[]` | `route_label`, `depart_time`, `arrive_time`, `stops` |
| `outbound.duration_minutes` | `duration_minutes` |
| `price.amount` / `price.currency` | `price.amount` / `price.currency` |
| `ignav_id` | `id`（前缀 `ignav-`） |
| `booking-links` URL | `booking_deep_link` |
| — | `source: "ignav"`, `confidence: "medium"` |

---

## 4. Spike 实现

### 4.1 目录

```
flight-spike/
├── flight_spike/ignav.py          # API 客户端 + normalize
├── scripts/tier15_ignav.py        # 跑 fixtures/routes.json
├── fixtures/routes.json           # 标准航线
├── .env.example                   # IGNAV_API_KEY=
└── output/YYYY-MM-DD/tier15_ignav.json
```

### 4.2 运行

```bash
cd flight-spike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# 编辑 .env：IGNAV_API_KEY=...

python scripts/tier15_ignav.py
```

### 4.3 环境变量

```bash
IGNAV_API_KEY=           # 必填；https://ignav.com/ 注册
```

---

## 5. 接入 travel 预览架构（验证通过后）

```
用户对话
    ↓
search_flights()
    ├─ ignav_provider.py     → offers[]（主，结构化）
    ├─ tripcom_deeplink.py   → purchase.url（预订 CTA，保留）
    └─ rank.py               → ranked[]
    ↓
LLM 仅引用 ranked[] + 免责
    ↓
前端 App 内展示推荐；「前往 Trip.com 确认预订」
```

**配置草案**：

```bash
FLIGHT_PROVIDER=ignav          # ignav | deeplink | letsfg | mixed
IGNAV_API_KEY=
FLIGHT_PURCHASE_CHANNEL=tripcom  # 预订仍跳 Trip.com
```

---

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| 价与 Trip.com 不一致 | `confidence: medium`；保留 Trip.com 预订链接 |
| 免费额度用尽 | 402 `billing_required`；降级仅 Deep Link |
| 亚太覆盖不足 | fixtures 三线对比；失败航线记录 `error.code` |
| LLM 上下文过大 | 仅传 `ranked` Top 5 摘要（Ignav 文档建议） |

---

## 7. 文档同步清单

验证完成后更新：

- [x] 验证报告（2026-07-03 Go 3/3）
- [x] Spike 验证报告 Tier 1.5 对比表
- [x] Trip.com 实施方案 Phase 1.6

---

*Ignav Tier 1.5 Spike 方案 · v1.1 · 2026-07-03*

**→ [Ignav 验证报告（2026-07-03 Go 3/3）](./01-航班信息-Ignav验证报告.md)**
