# 30 · STRAT-UI · HOT-TRIP · ACT-POOL 实施

← [25-三档](./25-GitHub能力借鉴与规划策略三档分析.md) · [26-Trip降级](./26-SerpAPI额度不足与Trip片区优先降级分析.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.2  
> **Skill**：`ai-chat-ui` · `llm-api-engineering` · `travel-product-flow`  
> **范围**：`STRAT-UI` · `HOT-TRIP-01/02/03` · `ACT-POOL`（prompt）  
> **不含**：RollingGo `HOT-RG-*`（见 [29](./29-RollingGo-MCP接入与Trip并存.md)）  
> **v1.2**：Maps 真池 + 出池执法见 [34](./34-玩法印证与节点借鉴分析结论.md) `ACT-POOL-ENFORCE`（`closed_poi_pool.py`）

---

## 0. 目标（本波 ✅）

| ID | 做完标准 | 落点 |
|----|----------|------|
| STRAT-UI | 摘要卡三档；有机酒/行程时确认；默认 A；C 需贴链/兴趣骨架 | `planning_strategy` · PlanSummaryCard · planReadiness · generate 门禁 |
| HOT-TRIP-01 | lodging 无 Serp/429 → Trip-first CTA，非 503 / 非「附近无店」 | `POST /stay-zones/lodging` · ZoneAreaLodgingModule |
| HOT-TRIP-02 | 片区卡片分组；已锁酒店按 zone 归组 | StayZonePanel |
| HOT-TRIP-03 | 无 geometry 不进「附近搜店」 | ZoneAreaLodgingModule + 片区警告 |
| ACT-POOL | verified `poi_candidates` → `CLOSED_POI_POOL` HARD（prompt） | `format_closed_poi_pool_block` · itinerary_llm 规则 21 |
| ACT-POOL-ENFORCE | 酒店锚 Maps 补池 + adopted∩围栏 + 出池执法 | [34](./34-玩法印证与节点借鉴分析结论.md) · `closed_poi_pool.py` |

---

## 1. 验证

```bash
cd backend && python scripts/test_lodging_trip_first.py
cd backend && python scripts/test_itinerary_credibility.py
cd backend && python scripts/test_closed_poi_pool.py
cd frontend && npx tsx src/utils/planReadiness.test.ts
```

---

*本波完成 · RollingGo 后端链见 HOT-RG-02 · 封闭池执法见 ACT-POOL-ENFORCE*
