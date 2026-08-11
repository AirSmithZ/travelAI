# 27 · 外部 API 缓存现状 · 问题与优化点

← [26-Trip降级](./26-SerpAPI额度不足与Trip片区优先降级分析.md) · [22-对话UX](./22-对话编排与玩法印证UX调研.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.0  
> **性质**：横切分析（现状盘点 + 问题 + 优化建议；非实施计划）  
> **范围**：机票 / 酒店 lodging / 天气 / geocode / 通勤 / 印证(Evidence) / Ops 等依赖外部 API 的缓存

---

## 0. 结论摘要

| # | 结论 |
|---|------|
| 1 | 缓存是 **按功能零散叠出来的**：前端内存 / localStorage、后端进程 dict、`lru_cache` 静态表并存，**无统一策略与额度协调**。 |
| 2 | **烧额度最重的 Serp 系**（Maps geocode / lodging / Directions）里：通勤与 Evidence 有 TTL；**geocode 无 TTL**；lodging 主要靠前端 12h；天气 **几乎无缓存**。 |
| 3 | 最大产品风险：**错误 geocode 结果可进进程缓存且不过期**（加重 P122 类错钉复现）；国家级 destination 圆心错误也会被 `_DEST_CENTER_CACHE` 钉死。 |
| 4 | 机票缓存合理偏短（价易变），但 **仅前端内存**，刷新/多标签/对话 Tool 路径易重复打 Ignav。 |
| 5 | 优化优先序建议：**geocode 加 TTL + 不缓存毒结果** → **天气短 TTL** → **Serp 共用预算/熔断** → **机票可选后端短缓存** → 清理死代码与统一 key 规范。 |
| 6 | **2026-08-10 已实施**（见 [28](./28-外部API缓存与GEO锚实施计划.md)）：GEO-CACHE-01 · GEO-13 · WX-CACHE-01 · SERP-BUDGET-01；机票后端缓存 / HOT-TRIP 仍开放。 |

---

## 1. 现状盘点（按域）

### 1.1 总表

| 域 | API | 缓存位置 | Key 维度 | TTL | 空/失败是否写入 | 刷新入口 |
|----|-----|----------|----------|-----|-----------------|----------|
| **机票报价** | Ignav（+Trip 深链） | FE `searchResultCache` **内存** | OD+日期+人数+偏好 | **10 min** | ❌ 空不入（P70） | Panel「刷新」`forceRefresh` |
| **片区 lodging** | SerpApi Maps | FE `lodgingSearchCache` **LS+内存** | hub lat/lng+radius+city | **12 h** | ❌ 空/429 不入（P120） | 「重新检索」 |
| **lodging（旧）** | 同上 | `searchResultCache.LODGING_*` | zoneId+hub | 30 min（常量） | — | **似已无调用方（死代码）** |
| **行程/店名 geocode** | Serp→Photon→Nominatim 等 | BE `_GEOCODE_CACHE` / `_DEST_CENTER_CACHE` **进程内存** | name+dest(+en/center) | **无 TTL** | ✅ 失败可写 `None` | 重启进程；`clear_geocode_caches` 仅测试/运维 |
| **天气预报** | 和风 daily | **无**（每次 generate 拉） | — | — | — | — |
| **和风 Geo 城心** | 和风 GeoAPI | 随 destination center 进 `_DEST_CENTER_CACHE` | destination 串 | 无 TTL | 失败可不写/写 None | 同 geocode |
| **EvidencePack** | TikHub±Tavily | BE `_EVIDENCE_CACHE` 进程 | dest+days+zone+tags+tavily | **7 d**（可配） | ❌ 空不入 | TTL / 重启 |
| **贴链详情** | TikHub from-link | FE `evidenceLinkCache` LS | 规范化 URL | **7 d** | 仅成功项 | 强制刷新参数 |
| **通勤 Directions** | SerpApi | BE `commute/cache` 进程 | 起终点 round4 + mode | **7 d**（可配） | 看调用方；TTL≤0 不写 | TTL / 重启 |
| **机场/城市码表** | 本地 JSON | `@lru_cache` | 查询串 | 进程寿命 | n/a | 进程重启 |
| **Ops 余额看板** | 多 provider | BE 单槽 `_cache` | 全局一份 | **60 s** | 写入整包 | `force` / clear |

### 1.2 机票（前端）

```text
FlightIntelPanel → flightCacheKey(OD|date|adults|pref)
  → cacheGet('flight', …, 10min)
  → 仅 ranked.length>0 命中/写入
```

- **后端 Ignav 搜索：无结果缓存**（每次 HTTP 都可能打上游）。  
- `travel_intel.last_flight_search` 会落计划状态，与「搜索缓存」是另一层（已确认列表 vs 瞬时搜价）。

### 1.3 酒店 lodging（前端为主）

```text
ZoneAreaLodgingModule → lodgingPersistCacheKey(lat,lng,radius,city)
  → localStorage 12h + 内存镜像
  → 仅非空 candidates
```

- 后端 `lodging_search` **无服务端缓存**；额度不足时再搜仍直打 Serp（见 [26](./26-SerpAPI额度不足与Trip片区优先降级分析.md)）。  
- `searchResultCache` 里仍留 `LODGING_CACHE_TTL_MS` / `lodgingCacheKey`，**当前无引用**，易误导。

### 1.4 天气

```text
generate → fetch_trip_forecast(destination, dates) → 和风 HTTP
```

- **无 TTL / 无按城缓存**；同城同日多次 generate / optimize 重复计费。  
- 结果会写入行程 `days[].weather`（产物持久化），但**不是**「下次生成前复用预报 API」的缓存层。

### 1.5 Geocode（后端 · 高影响）

```text
_GEOCODE_CACHE[(name, dest, name_en, center…)] → hit | None   # 无过期
_DEST_CENTER_CACHE[dest.lower()] → DestinationCenter | None   # 无过期
容量：256 / 64；满则 pop 插入序首条（近似 FIFO，非 LRU）
```

- 住宿侧可通过 `center_lat/lng` 区分 key；**行程 `geocode_itinerary` 常不传 center** → 与酒店锚不共享，且错误「越南」圆心会长期复用。

### 1.6 印证 / 通勤

- Evidence：控 TikHub 费，7 天进程缓存；key 不含「用户贴链」集合（贴链走前端 LS）。  
- Commute：控 Serp Directions，7 天；坐标 round(4)≈11m 粒度合理。

---

## 2. 问题清单

### 2.1 正确性 / 产品

| ID | 问题 | 影响 |
|----|------|------|
| C1 | **Geocode / dest-center 无 TTL**，错误命中与 `None` 可长期存活 | P122 类错钉、错误国家圆心在同进程内「越用越稳错」 |
| C2 | 行程 geocode **不吃机酒锚**，与 lodging/酒店 geocode **缓存命名空间分裂** | 同名 POI 在「越南」围栏下缓存的错点，不会被酒店侧正确点纠正 |
| C3 | 机票仅 FE 内存：刷新丢失；Chat Tool 搜航班 **未必走同一 cache** | 重复 Ignav、体验不一致 |
| C4 | 天气无 API 缓存：短时反复 generate 重复拉预报 | 费额度；慢 |

### 2.2 成本 / 额度

| ID | 问题 | 影响 |
|----|------|------|
| M1 | Serp 用途拆三处（geocode / lodging / directions），**无统一日预算、无共享负缓存** | 一处 429 其它照打；与 [26] 额度危机同源 |
| M2 | lodging 缓存只在浏览器：换设备 / 清 LS / 多用户同一后端仍打满 Serp | 降本不完整 |
| M3 | Evidence/Commute 7d 合理，但 **多 worker / 多进程各一份**，有效命中率打折 | 部署扩容后控费变弱 |
| M4 | Geocode 缓存失败 `None`：短暂上游故障会「锁死」该 query 直到 FIFO 挤掉 | 该补的点补不上，或反向：偶发错点钉死 |

### 2.3 工程债

| ID | 问题 |
|----|------|
| E1 | `searchResultCache` 的 lodging API **死代码**；与 `lodgingSearchCache` 双轨 |
| E2 | 驱逐策略多为 **插入序 FIFO**，热点 key 也可能被挤掉，冷毒 key 反占坑 |
| E3 | 无统一可观测：命中率 / 按 provider 省下的调用数（Ops 只看余额，不看 cache hit） |
| E4 | TTL 单位混用（FE ms / BE sec / 有的写死），文档散落 P70/P120/WS-CACHE |

---

## 3. 可优化点（按优先级）

### P0 — 正确性优先

1. **Geocode 缓存加 TTL**（建议成功 24h、失败/None **5–15min**；dest-center 成功 24h、失败短 TTL）。  
2. **毒结果策略**：`coord_confidence=low` / 出围栏丢弃 / 明确 `country_code` 与 destination 国家不一致时 **禁止写入**或短 TTL。  
3. **GEO-13**：行程 geocode key 纳入 `center_lat/lng`（酒店或 SGN），与住宿缓存语义对齐，避免「越南」毒 key 污染胡志明查询。  
4. **destination 别名**：越南/胡志明补 `vn`（减少错误圆心进入 `_DEST_CENTER_CACHE`）。

### P1 — 控费（Serp / 和风 / TikHub）

5. **天气**：按 `(location_id|city, span)` 缓存 **3–6h**（预报日内相对稳）；generate 前先读缓存。  
6. **Serp 熔断**：进程级 `rate_limited_until`；429 后 geocode/lodging/directions **共享退避**（配合 [26] Trip-first）。  
7. **lodging**：有额度时可选 **后端短缓存**（hub+radius，1–6h），与 FE LS 双层；无额度走 Trip 降级不打 Serp。  
8. Evidence/Commute：多实例时再考虑 Redis；单机 Phase 1 可维持进程缓存。

### P2 — 体验一致

9. **机票**：可选后端 5–10min 缓存（与 FE TTL 对齐）；Chat Tool 与 Panel **共用同一 key 规范**。  
10. 统一「缓存命中」文案与强制刷新（航班已有；lodging/evidence 已有；天气/geocode 可在 progress 事件里标 `cache_hit`）。

### P3 — 清理与规范

11. 删除或标注废弃 `searchResultCache` 的 lodging 常量/函数。  
12. 小文档表：`docs` 或 backend README「外部 API 缓存矩阵」（本文 §1 可作源）。  
13. FIFO → 简易 LRU（访问时 move-to-end）对 geocode/evidence 更稳。

---

## 4. 建议不做什么（现阶段）

| 不做 | 原因 |
|------|------|
| 全站上 Redis「一锅炖」 | 单机产品过重；先修 TTL/毒缓存/Serp 熔断 |
| 机票缓存数小时 | 价敏；10min 量级合适 |
| 把 Trip 深链结果当缓存库存 | 无结构化列表（[26]） |
| 缓存 LLM generate 全文当「API 缓存」 | 与外部 API 控费不同层；易脏数据 |

---

## 5. 与开放项映射（讨论稿）

| 优化 | 可挂 ID |
|------|---------|
| Geocode TTL + 毒结果 | 可并入 **GEO-13** 或新 `GEO-CACHE-01` |
| 天气短缓存 | `WX-CACHE-01` |
| Serp 共享熔断 | `SERP-BUDGET-01`（与 HOT-TRIP-01 联动） |
| 机票前后端缓存对齐 | `FLT-CACHE-01` |
| 死代码清理 | `UX-FLT-CACHE` 收尾 / chore |

未立项前本文仅作分析；实施需产品确认优先级（建议 **GEO 缓存正确性 > 天气 > Serp 熔断**）。

---

## 6. 决策倾向（分析结论）

| 问题 | 倾向 |
|------|------|
| 当前缓存够不够用？ | **控费半够、正确性不够**（geocode/天气是缺口） |
| Serp 额度危机是否只靠 lodging LS？ | **否**；需 Trip 降级 + geocode/directions 共熔断 |
| 要不要先做统一缓存框架？ | **先补 TTL/策略**，框架可后置 |

---

*文档版本：v1.0 · 2026-08-10*
