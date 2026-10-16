# 40 · HOT-ZONE-CATALOG 方案 D（封闭片区池）

← [32](./32-住宿粗推多片区与偏好Tag实施.md) · [36](./36-住宿搜索UX与换店困难分析.md) · [38](./38-多城城段实施影响与联动改动.md) · [问题日志 P131](../问题日志/01-开放中.md#p131) · [TODO](./TODO.md)

> **日期**：2026-08-12 · **拍板**：方案 **D**（目录全列 + LLM/规则排序 + 地图/店名自助）  
> **约束**：不要 mock 库存；目录为**真实商圈坐标**；搜店仍 RollingGo/Trip（Query ≠ book）  
> **Skill**：travel-product-flow — 片区目录 = 住宿侧 closed pool；LLM 禁止编目录外 id

---

## 1. 产品形状

| 层 | 行为 |
|----|------|
| 目录 | 按 **当前 segment.city** 取封闭表（id/label/center/radius/search_query） |
| 排序 | 规则/主题轻排（刀 1）；**LLM 仅重排目录 id**（刀 3，代码 enforce） |
| 搜店 | **单活跃区**；点「搜附近」才请求；复用 lodging L2 缓存 |
| 自助 | **地图 temp 区** + 店名搜索（非目录也可） |
| 非试点城 | 退回 A（4～6 LLM 区）+ 店名/地图 temp |

---

## 2. 工程刀

| 刀 | 内容 | 状态 |
|----|------|------|
| **1** | 胡志明试点目录 + 载入全列 + 单选活跃 + 懒搜 + cache key 含城/日期 | ✅ |
| **2** | 观测打点、空结果短 TTL 策略显式化、非试点文案 | ✅ |
| **3** | LLM 只排序目录 id；地图 temp 区；第二城（岘港） | ✅ |

---

## 3. 验收

1. 目的地/城段为胡志明时，可「载入片区目录」看到 ≥6 个真实区（含几何）  
2. 未点搜附近不打 lodging API；同 hub+日期二次打开可缓存命中  
3. 确认/锁店仍走既有 confirm + P128 scoped  
4. **刀2**：空结果 3min 冷却（可强制重搜）；非试点城有「请用粗推」文案；DEV 可见 `[stay-zone]` 观测  
5. **刀3**：试点城粗推 → `source=catalog|catalog_llm`；目录外 id 被丢弃；岘港 ≥6 区；「地图点选临时区」可生成 `temp:map:*` 并搜附近  

---

## 4. 缓存策略（刀2 显式）

| 结果 | TTL | 行为 |
|------|-----|------|
| 非空候选 | 12h（`LODGING_LS_TTL_MS`） | `getLodgingSearchCache` 命中可上图 |
| 空 / 无钉 | 3min（`LODGING_EMPTY_TTL_MS`） | 冷却内不自动再打上游；「重新搜索」强制跳过 |
| 429/失败且无旧成功缓存 | 同空结果 | 写 empty miss；有旧成功则展示旧钉不覆盖 |

观测：`observeStayZone`（`catalog_load` / `lodging_search` outcomes）→ DEV `console.info` + 内存 ring。

---

## 5. 刀3 落点

| 项 | 路径 |
|----|------|
| BE 目录 | `backend/app/services/stay_zone/catalog.py`（HCMC + Da Nang） |
| BE 排序 enforce | `recommend.py` · `order_catalog_by_ids` · `STAY_ZONE_CATALOG_RANK_SYSTEM` |
| FE 目录 | `frontend/src/data/stayZoneCatalog/{hcmc,danang}.ts` |
| 地图 temp | `mapPickStayTemp` · `addTempStayZoneFromMap` · TravelMap banner |

验证：

```bash
cd frontend && npx tsx src/utils/stayZoneCatalog.test.ts
cd backend && PYTHONPATH=. python scripts/test_stay_zone_catalog.py
```

---

## 6. 不做

全国字典一期铺开、多选区并行搜、假全市酒店池、目录当可订库存。
