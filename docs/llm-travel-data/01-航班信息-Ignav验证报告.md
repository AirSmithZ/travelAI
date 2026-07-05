# 航班信息 Ignav Spike 验证报告

← [返回 01-航班信息](./01-航班信息.md) · 方案：[Ignav 验证方案](./01-航班信息-Ignav验证方案.md) · 原始数据：`flight-spike/output/2026-07-03/tier15_ignav.json`

> **执行日期**：2026-07-03  
> **执行方式**：`flight-spike/scripts/tier15_ignav.py` + `fixtures/routes.json` 三线  
> **状态**：**Go — 3/3 航线成功，可作为 App 内查价主源候选**

---

## 1. 结论摘要

| 项 | 结果 |
|----|------|
| **Spike 代码** | ✅ `flight_spike/ignav.py` + `tier15_ignav.py` |
| **API Key** | ✅ 配置于 `travel/.env`（脚本已支持读取根目录 `.env`） |
| **结构化报价** | ✅ **3/3** 航线返回 `itineraries` 并可映射 `FlightQuote` |
| **延迟 P50** | **5.7s**（2.8s～11.7s）— 满足同步 HTTP（建议 timeout 30s） |
| **LLM 可用性** | ✅ 每条航线 `ranked_preview` ≥5 条 |
| **预订链接** | ⚠️ 仅部分 itinerary 返回 `booking-links`（最便宜 Spring PVG→SIN 有 ch.com 链） |
| **Go/No-Go** | **Go-E（Ignav 查价 + Trip.com 预订 CTA）** |

**一句话**：Ignav 在亚太与欧美对照线均返回秒级结构化报价，**显著优于 LetsFG CLI**（158s、1/3 成功率）；推荐作为 App 内查价 + LLM 分析主源，Trip.com Deep Link 保留为确认预订入口。

---

## 2. 测试环境

| 项 | 值 |
|----|-----|
| 机器 | darwin |
| 目录 | `flight-spike/` |
| 依赖 | `httpx` |
| API | `https://ignav.com`（`X-Api-Key`） |
| Key 位置 | `travel/.env` → `IGNAV_API_KEY` |
| 输出 | `output/2026-07-03/tier15_ignav.json` |

---

## 3. fixtures 三线结果

| 航线 | 成功 | 延迟 | 报价数 | 最低价 | 备注 |
|------|------|------|--------|--------|------|
| **PVG→SIN** 2026-10-16 | ✅ | **11,681 ms** | 21 | USD 126 | Spring 直飞；LetsFG 同线 ≈158s |
| **HKG↔NRT** 2026-11-01/08 | ✅ | **5,688 ms** | 17 | USD 498 | LetsFG 180s 超时 |
| **LHR→JFK** 2026-07-15 | ✅ | **2,810 ms** | 25 | USD 713 | 欧美对照 |

### PVG→SIN Top 5（ranked）

| # | 航司 | 航线 | 时长 | 经停 | 参考价 |
|---|------|------|------|------|--------|
| 1 | Spring | PVG→SIN | 5h40m | 0 | USD 126 |
| 2 | Singapore Airlines | PVG→SIN | 5h20m | 0 | USD 199 |
| 3 | Singapore Airlines | PVG→SIN | 5h25m | 0 | USD 199 |
| 4 | Vietjet | PVG→SGN→SIN | 8h00m | 1 | USD 153 |
| 5 | Vietjet | PVG→HAN→SIN | 11h35m | 1 | USD 134 |

### booking-links

- 最便宜 Spring 班：`https://en.ch.com/...`（航司直链）
- 多数 SQ / Vietjet 等：`booking_deep_link` 为空 — 不影响 App 内分析；最终预订仍走 **Trip.com CTA**

---

## 4. 与既有 Tier 对比

| 维度 | Tier 1 LetsFG | **Tier 1.5 Ignav** | Tier 0 Trip.com |
|------|---------------|---------------------|-----------------|
| 用户跳转查价 | 否 | **否** | 是 |
| PVG→SIN 成功 | ✅（158s） | **✅（11.7s）** | URL only |
| HKG↔NRT 成功 | ❌ timeout | **✅（5.7s）** | URL only |
| 结构化 JSON | ⚠️ CLI 解析 | **✅ REST** | ❌ |
| LLM 可分析 | ⚠️ | **✅** | ❌ |

---

## 5. 推荐架构（采纳）

```
search_flights()
  ├─ ignav_provider.py     → offers[] / ranked[]   （主，App 内查价）
  ├─ tripcom_deeplink.py    → purchase.url          （预订 CTA）
  └─ letsfg_provider.py     → 可选 fallback
```

**配置**（`travel/.env`）：

```bash
IGNAV_API_KEY=ignav_0S3ZfS1sP5BXvCRAD8-aXAIbkrOB7fiq
# Trip.com 预订仍用既有 TRIPCOM_* 变量
```

**脚本读取顺序**：`flight-spike/.env` → `travel/.env`（后者不覆盖已设变量）。

---

## 6. 风险与后续

| 风险 | 对策 |
|------|------|
| 价为 USD，与 Trip.com CNY 可能有差 | UI 标注 `confidence: medium`；预订以 Trip.com 为准 |
| booking-links 不全 | 不依赖 Ignav 预订链；用 Trip.com `purchase.url` |
| 免费 1000 次后计费 | 监控用量；同航线缓存 15～30min |
| `.env.example` 勿提交真实 Key | 已改回占位符；Key 仅放 `.env` |

**下一步（travel 主项目）**：

1. ~~迁入 `backend/app/services/flight/ignav_provider.py`~~ ✅ 2026-07-03  
2. ~~`search.py` 默认 `include_ignav=true`（或 `FLIGHT_INCLUDE_IGNAV`）~~ ✅  
3. 主 App 阶段 B UI（`FlightIntelPanel`）✅；Chat Tool 改调 Ignav ⏳  
4. LetsFG 降为 fallback ✅  
5. P4：`POST /itineraries/generate` 注入 `travel_intel` 硬约束 ⏳  

---

## 7. 复现

```bash
cd flight-spike
source .venv/bin/activate
# 确保 travel/.env 含 IGNAV_API_KEY
python scripts/tier15_ignav.py
```

---

*报告版本：v1.2 · P1/P2 主项目落地 · 2026-07-03*
