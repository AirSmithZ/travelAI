# 31 · RollingGo lodging 接入（HOT-RG-02）· 地图钉

← [29-MCP探通](./29-RollingGo-MCP接入与Trip并存.md) · [26-Trip降级](./26-SerpAPI额度不足与Trip片区优先降级分析.md) · [30-STRAT/HOT-TRIP](./30-STRAT-UI与HOT-TRIP与ACT-POOL实施.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.1  
> **Skill**：`find-skills` → `llm-api-engineering` · `rollinggo-hotel-booking`  
> **待办**：`HOT-RG-02` ✅  
> **性质**：分析 + 实施完成

---

## 0. Skill 选型

| Skill | 用途 |
|-------|------|
| **find-skills** | 后端外呼走 `llm-api-engineering`；参数对齐 `rollinggo-hotel-booking` |
| **llm-api-engineering** | Key 仅环境变量；超时；结构化解析；失败 → Trip CTA（不伪「无店」） |
| **rollinggo-hotel-booking** | `place`/`placeType`、参考价；本波不下单 |
| **ai-chat-ui** | 锁店仍需人确认 |

---

## 1. 结论（已落地）

| # | 结论 |
|---|------|
| 1 | RollingGo `searchHotels` → 带 lat/lng 候选 → StayZone 列表 + 地图钉 |
| 2 | 优先链：**RollingGo →（可选 Serp，`LODGING_ENABLE_SERP` 默认 false）→ Trip CTA** |
| 3 | 价标「参考价」；Trip 深链并存；可选展示 RollingGo `bookingUrl`（标渠道） |
| 4 | 无 geometry 仍遵守 HOT-TRIP-03 |

---

## 2. 落点

| 文件 | 作用 |
|------|------|
| `rollinggo_client.py` | MCP `tools/call` |
| `rollinggo_lodging.py` | placeType / 半径过滤 / 映射 candidate |
| `stay_zones.py` `/lodging` | 优先链编排 |
| `StayZoneLodgingCandidate` | `ref_price` · `booking_url` · `mode=rollinggo` |
| ZoneAreaLodgingModule | 搜索上图 + Trip CTA |
| `.env` | `ROLLINGGO_MCP_*` · `LODGING_ENABLE_SERP` |

---

## 3. 验证

```bash
cd backend && python scripts/test_rollinggo_lodging.py
cd backend && python scripts/test_lodging_trip_first.py
```

产品：确认片区 →「搜索片区酒店」→ 钉上图 → 锁定；旁路 Trip.com。

---

*本波完成 · 订房/OAuth 仍属商务后续*
