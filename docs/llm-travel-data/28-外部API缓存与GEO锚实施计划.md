# 28 · 外部 API 缓存与行程 geocode 锚 · 实施计划

← [27-缓存分析](./27-外部API缓存现状与优化分析.md) · [P122](../问题日志.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.1 · **状态**：✅ 本波已实施  
> **Skill**：`llm-api-engineering`（不可靠外部服务：TTL、熔断、失败短缓存、可观测）  
> **范围（本波）**：`GEO-CACHE-01` · `GEO-13`（含 VN 别名）· `WX-CACHE-01` · `SERP-BUDGET-01` · FE geocode 透传 intel  
> **不做（本波）**：机票后端缓存 · HOT-TRIP UI · Redis · 完整 ACT-POOL

---

## 0. 目标

| ID | 目标 | 验收 |
|----|------|------|
| GEO-CACHE-01 | geocode / dest-center **TTL**；失败短 TTL；国家码冲突拒写 | ✅ `test_geo_cache_and_circuit.py` |
| GEO-13 | 行程 geocode 吃 **酒店坐标 / 航班 IATA** 围栏 | ✅ generate + geocode-nodes + FE intel |
| WX-CACHE-01 | 和风预报短 TTL | ✅ 同 loc+span 二次命中 |
| SERP-BUDGET-01 | Serp **共享 429 熔断** | ✅ lodging/geocode/directions |

---

## 5. 完成记录

- 单测：`scripts/test_geo_cache_and_circuit.py` · `test_geocode_fence.py` · `test_stay_zone_geocode_bias.py`
- 配置：`.env.example` 增加 TTL / `SERP_CIRCUIT_BACKOFF_SEC`
- 文档：TODO / P122 / [27](./27-外部API缓存现状与优化分析.md) 回写

*实施完成：2026-08-10*

---

## 1. 设计要点（Skill）

1. **成功长 TTL / 失败短 TTL** — 避免毒结果与短暂故障锁死。  
2. **熔断** — 429 后全局 `open_until`，不指数重试烧额度。  
3. **锚点优先** — `center_lat/lng` 进 cache key 与 fence，与住宿 `GeocodePlaceContext` 对称。  
4. **配置化** — `.env` 可关 TTL（0=禁用缓存写）。

---

## 2. 文件清单

| 文件 | 变更 |
|------|------|
| `services/serp_circuit.py` | **新建** 共享熔断 |
| `services/geocoding.py` | TTL 缓存；拒毒圆心；`geocode_itinerary` 接 center |
| `services/stay_zone/geocode_bias.py` | `resolve_itinerary_geocode_context` |
| `data/city_aliases.py` | 越南/胡志明/河内/岘港 |
| `services/qweather_forecast.py` | 预报进程缓存 |
| `services/geocode_providers.py` | Serp 前检查熔断；429 打开熔断 |
| `services/stay_zone/lodging_search.py` | 同上 |
| `services/commute/directions.py` | 同上 |
| `services/itinerary_llm.py` | finalize / mock 路径传 geocode kwargs |
| `api/v1/itineraries.py` + schema | geocode-nodes 可选 `travel_intel` |
| `config.py` + `.env.example` | TTL / backoff 配置 |
| FE `api/itinerary.ts` + `usePlanStore` | geocode stream 带 intel |
| `scripts/test_*.py` | 缓存 / 熔断 / 别名 / context |
| 文档 TODO / 问题日志 / 27 / 进度 | 完成后勾选 |

---

## 3. 配置默认值

| 变量 | 默认 | 含义 |
|------|------|------|
| `GEOCODE_CACHE_TTL_SEC` | 86400 | 成功 hit |
| `GEOCODE_CACHE_MISS_TTL_SEC` | 600 | `None` / 失败 |
| `DEST_CENTER_CACHE_TTL_SEC` | 86400 | 成功圆心 |
| `DEST_CENTER_CACHE_MISS_TTL_SEC` | 600 | 圆心失败 |
| `WEATHER_CACHE_TTL_SEC` | 14400 | 预报 4h |
| `SERP_CIRCUIT_BACKOFF_SEC` | 120 | 429 后关闭秒数 |

---

## 4. 实施顺序

1. config + serp_circuit + city_aliases  
2. geocode TTL + itinerary context + wire LLM/API/FE  
3. weather cache  
4. Serp hooks  
5. 单测  
6. 同步文档状态  

---

*实施中 → 完成后将本页状态改为 ✅ 并回写 [27](./27-外部API缓存现状与优化分析.md) / TODO*
