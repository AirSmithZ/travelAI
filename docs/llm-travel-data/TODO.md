# 机酒 / LLM 数据 — 待办清单

← [总索引](../TODO.md) · [README](./README.md) · [06-机酒流程](./06-机酒确认与行程生成流程方案.md)

> **更新**：2026-08-09（+ **COST-01** Viator 账号审核阻塞）  
> **ID 前缀**：`SEC-` / `DATA-` / `B-` / `GEO-` / `WX-` / `WS-` / `AG-` / `TRN-` / `COST-` · 状态：🔲 开放 · ⏸ 暂停 · ✅ 完成 · 🔧 进行中

---

## 0. 安全 / 合规 `SEC-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **SEC-01** | ✅ | **P0** | 三处 Chrome 档案出 index；gitignore `**/.edreams_chrome_data/` | [复检报告](../复检报告-travelAI-drag_dev2.md) |
| **SEC-01b** | 🔲 | **P0** | 若曾 push：轮换 eDreams/Trip.com 账号；可选 filter-repo（**运维，本波不做**） | [复检报告 §2](../复检报告-travelAI-drag_dev2.md) |
| **SEC-02** | 🔲 | P2 | 公网部署前：generate 鉴权或限速；收紧 CORS（**运维/部署前**） | [残留报告](../残留漏洞分析报告-travelAI-drag_dev2-2026-08-07.md) |
| **SEC-03** | ✅ | **P1** | 提示注入隔离 HARD / USER_DATA / UNTRUSTED_UGC / **CURRENT_ITINERARY**（既有行程非指令） | `itinerary_llm.py` · [复查报告](../实施偏离与问题复查报告-travelAI-drag_dev2-2026-08-07.md) |
| **SEC-04** | ✅ | P3 | 外部 base_url：`https` + 主机 allowlist（field_validator）；单测 `test_sec04_allowlist.py` | `config.py` · [backend README](../../backend/README.md) |
| **FLT-LETSFG** | ✅ | P2 | 默认关闭；主源 Ignav；合规/spike 边界已文档化 | `.env.example` · [backend README](../../backend/README.md) |
| **GEO-06/07/08** | ✅ | — | 围栏降级 / 名称相关 / 距离融合 | [复检/残留报告](../复检报告-travelAI-drag_dev2.md) |
| **OPS-01** | ✅ | P2 | 独立 `/ops.html` 用量看板：官方余额 API + 会话计数（主壳零入口） | `ops_provider_accounts.py` · `GET /api/v1/ops/usage` · [backend README](../../backend/README.md) |

---

## 0b. 地理编码 `GEO-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **GEO-01/02/04** | ✅ | P0 | 围栏 / warnings / data 跟踪 | [17](./17-用户决策回应与Geocode机酒重排.md) |
| **GEO-03** | ✅ | P1 | SerpApi Google Maps 主源 | [20 §5](./20-L1L2运行验证记录.md) |
| **GEO-05** | ✅ | P1 | NodeCoordEditor 400ms debounce | `NodeCoordEditor.tsx` |
| **GEO-09** | ✅ | P2 | 和风 GeoAPI 城市中心优先 + 英译 query 变体 | `qweather_geo.py` · `geocoding.py` |
| **GEO-10** | ✅ | P1 | LLM `name_en` + 英文优先检索/评分 + Wikidata 补查（P82） | `itinerary_llm.py` · `geocoding.py` · `wikidata_geo.py` |
| **GEO-11** | ✅ | P0 | 片区几何 geocode bias：`zone.city` / 航班抵达城优先于模糊 destination（P113） | `stay_zone/geocode_bias.py` · `enrich.py` · [问题日志 P113](../问题日志.md) |
| **GEO-12** | ✅ | P0 | 国家级 destination + 歧义城名：航班 IATA 坐标钉 fence + country_code（P117） | `GeocodePlaceContext` · `geocoding.py` center_* · [问题日志 P117](../问题日志.md) |

### 酒店 / 流程 / 排序

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **HOT-01** | 🔲 | P1 | 验证 Hotelbeds / Trip Partner 是否可申请沙箱（**商务，非代码**） | [17 §2](./17-用户决策回应与Geocode机酒重排.md) |
| **HOT-02** | ✅ | P2 | 片区内 lodging（SerpApi Maps）+ Trip 深链价 | `POST /stay-zones/lodging` · StayZonePanel |
| **HOT-02b** | ✅ | P0 | lodging EN query + 429/status 可感知；半径放宽；禁中文 slogan q（P118） | `lodging_search.py` · [问题日志 P118](../问题日志.md) |
| **HOT-02c** | ✅ | P0 | 坐标 reverse→EN 城名；SSL/超时瞬时重试且停烧劣 q（P119） | `city_en_from_coords` · [问题日志 P119](../问题日志.md) |
| **HOT-02d** | ✅ | P1 | lodging localStorage L2 缓存；hub+radius key；429 降级展示（P120） | `lodgingSearchCache.ts` · [问题日志 P120](../问题日志.md) |
| **HOT-03** | ✅ | P1 | 每晚预算字段/UI；Trip 深链 `highPrice`；prompt 软约束 | [18](./18-机酒优先与迭代行程产品决策.md) · StayZonePanel |
| **FLT-RANK-01/02** | ✅ | — | 5:2:2:1 + 参考价文案 | `rank.py` · FlightIntelPanel |
| **FLOW-01/01b** | ✅ | — | 无航班阻断前后端 | [18](./18-机酒优先与迭代行程产品决策.md) |
| **FLOW-01c** | ✅ | P0 | 无锁定酒店阻断 generate；生成前锁店进 intel；日闭环+三餐锚定 | [18 §4.3](./18-机酒优先与迭代行程产品决策.md) · [问题日志 P88](../问题日志.md) |
| **FLOW-01d** | ✅ | P0 | 明确返程日禁止晚间入住酒店（对称抵达日无早出） | [问题日志 P92](../问题日志.md) · `intel_anchor_enforce.py` |
| **GEN-THINK** | ✅ | P0 | generate/fix `thinking:disabled`；截断 flash 修；前端 validate 态 | [问题日志 P93](../问题日志.md) |
| **FLOW-02** | ✅ | P1 | `optimize` / `regenerate` + dirty banner（不自动重跑） | [18 §4](./18-机酒优先与迭代行程产品决策.md) · [20 §6](./20-L1L2运行验证记录.md) |
| **UX-FLT-CACHE** | ✅ | P2 | 航班 / lodging 同条件前端缓存 + TTL + 刷新（**P70：空结果不入缓存**） | [22 §2.4](./22-对话编排与玩法印证UX调研.md) · `searchResultCache.ts` · [问题日志 P70](../问题日志.md) |

---

## 0c. 生成数据契约 `DATA-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **DATA-01～09** | ✅ | — | 见历史清单 | — |
| **DATA-10** | ✅ | P3 | 可选 `place_id` 持久化 + 跨天 POI 软警告 | `crossDayPoiDedup.ts` · geocode hit |
| **GEN-TOKEN** | ✅ | P0 | generate `max_tokens` 默认 8000；禁空 content→`{}`；日节点 4–6；单次修复轮 + 可读错误 | [问题日志 P90](../问题日志.md) · `llm_client.py` · `itinerary_llm.py` |

> **DATA-08 注**：`localStorage` **键**仍为历史名 `travel_plans_v1`；payload 内 `version` 为 `STORAGE_VERSION=3`。

---

## 1. 阶段 B 主链路（P3–P6）

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **B-P3-01/02** | ✅ | P1 | 多航段 UI + 城际快捷 | FlightIntelPanel |
| **B-P4-01/02/03/04** | ✅ | P0 | intel 硬约束 / 门禁 / snapshot | [18](./18-机酒优先与迭代行程产品决策.md) |
| **B-P4-05** | ✅ | P0 | 确认航班硬钉机场时刻 + 同日接龙（P94） | [问题日志 P94](../问题日志.md) · `intel_anchor_enforce.py` |
| **B-P4-06** | ✅ | P1 | 品类停留时长 L1 夹逼（P95；不用 Tavily 验时） | [问题日志 P95](../问题日志.md) · `visit_duration.py` |
| **B-P6-01** | ✅ | P2 | 多酒店覆盖/缺口/重叠软警告 | `hotelStayValidate.ts` · StayZonePanel |
| **B-P6-02** | ✅ | P2 | 总览图主酒店高亮 + 跨天/绑定软警告 | [06 §7 P6](./06-机酒确认与行程生成流程方案.md) · `primaryHotelOverview.ts` |

---

## 2. 航班 — Chat / Tool / 增强

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **B-FLT-01/02** | ✅ | P1 | Chat `search_flights` → Ignav + 禁编票价 | chat_parse · ChatPanel |
| **B-FLT-03** | ✅ | P2 | `parseTripcomSearchUrl` 预填手动表单 | `parseTripcomSearchUrl.ts` |
| **B-FLT-04** | ✅ | P2 | `POST /flights/manual-validate` | `manual_validate.py` |
| **B-FLT-05** | ✅ | P3 | FlightVerifyApp 中文航线列 `formatLegRoute` | FlightVerifyApp |
| **B-FLT-06** | ✅ | P3 | `npm run sync:airport-labels` ← `city_codes.json` | [09](./09-阶段B航班功能实施计划.md) |
| **B-FLT-07** | ✅ | P3 | 深链仅用户点击 `<a target="_blank">`，无 auto open（回归确认） | Flight/Stay panels |
| **B-FLT-08** | ⏸ | — | flight-verify 合并或废弃 | [06](./06-机酒确认与行程生成流程方案.md) |

---

## 3. 住宿 P5b ⏸ / P5z ✅

| ID | 状态 | 项 |
|----|------|-----|
| B-P5b-* | ⏸ | OTA 对称搜价不排期 |
| B-P5z-V01～V04 | ✅ | 片区倒推验收（见 [13](./13-阶段B住宿区域实施计划.md)） |

---

## 3b. 通勤 `TRN-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **TRN-01** | ✅ | P1 | 按需 `POST /commute/lookup`（SerpApi Directions）+ EdgeEditor 查询；提示词海路/山路兜底；`route_source` | [04](./04-通勤与交通卡.md) · [问题日志 P114](../问题日志.md) |
| **TRN-02** | ✅ | P1 | geocode 后可疑边自动补算 + Directions TTL 缓存；`COMMUTE_AUTO_*`；全量 Directions 仍关 | [04 §5.2](./04-通勤与交通卡.md) · [问题日志 P115](../问题日志.md) |
| **TRN-02b** | ✅ | P1 | 通勤核实后按边时长重排当日时刻（后端 realign + EdgeEditor cascade） | [04 §5.3](./04-通勤与交通卡.md) · [问题日志 P116](../问题日志.md) |
| **TRN-03** | ⏸ | P3 | 交通卡 YAML KB（产品暂不做） | [04 §3](./04-通勤与交通卡.md) |

---

## 3c. 节点开销补价 `COST-*`

> 品类分流：门票 → Viator（优先）/ GYG；餐饮 → Places 价位带 + 城市人均表；机酒/通勤走既有链路。Expense 须标 `quote` / `partner` / `price_band` / `estimate`。

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **COST-01** | ⏸ | P2 | **Viator Affiliate API**：账号已注册（Partner `P00313968`），**审核中**；后台 Tools 仅见 Widgets，待开通后从 `partners.viator.com/developer-api` 取 `exp-api-key` → 生成后对 `attraction`/`landmark` 名称匹配补 `cost` + 预订深链 | [03 §4 Phase 2](./03-游玩项目.md) · ExpensePanel |
| **COST-02** | 🔲 | P2 | 餐饮价位：优先复用 SerpAPI Maps 价位字段；不足再 Places `priceLevel`/`priceRange` + 城市人均表 → `restaurant`/`snack` 区间价 | [03 §2](./03-游玩项目.md) |
| **COST-03** | 🔲 | P3 | schema：生成路径保留结构化 `cost`（现多丢，仅 `cost_label`）；来源字段写入 meta | `itinerary_llm.py` · FE `NodeCost` |

---

## 4. 天气 / 联网 / Agent（多数 ⏸）

| ID | 状态 | 说明 |
|----|------|------|
| **WX-01** | ✅ | 和风每日预报 → generate 注入 + `days[].weather` source=api；雨日软约束 | [15 §1.3](./15-天气联网与决策Agent缺口分析.md) · `qweather_forecast.py` |
| **WX-02** | ⏸ | 天气指数 / 预警增强（非主路径） | [15](./15-天气联网与决策Agent缺口分析.md) |
| **WX-03/04** | 🔲 | Chat `fetch_weather` / rain_plan UI（等产品排期） | [15](./15-天气联网与决策Agent缺口分析.md) · OV-04 |
| **WS-01/02/03/05** | 🔲 | Tavily 完整网页桶（authority soft-merge 已随 WS-09） |
| **WS-04/06/07** | ✅ | EvidencePack + 侧栏 + TikHub（**成本决策：保留 TikHub 主源**，见 [21 §0.1](./21-Agent-Reach与玩法印证多源实施调研.md)） |
| **WS-10** | ✅ | **贴链 MVP**：多链接模块 + `from-link` + `user_evidence` 优先注入（[23](./23-玩法印证贴链MVP实施.md)） |
| **WS-CACHE** | ✅ | EvidencePack TTL 缓存降本（`EVIDENCE_CACHE_TTL_SEC`） |
| **WS-08a** | ✅ | 轻量 POI 抽取 + geocode 围栏校验 → `meta.poi_candidates` |
| **WS-08b** | ✅ | SerpAPI Maps 类型/评分 enrich（soft-fail；`places_enrich.py`） |
| **WS-09** | ✅ | Evidence 多源 bench + query/过滤 + Tavily authority soft-merge |
| **AG-01** | ✅ | 规则管道注入 generate |
| **AG-02/03/04** | 🔲 | 矩阵配置 / 意图路由 / 完整 Agent+KB |

---

## 5. 数据层 / Skill

| ID | 状态 | 待办 |
|----|------|------|
| **B-R-01/02** | ⏸ | Duffel / LetsFG 主链 |
| **B-SK-01/02** | 🔲 | travel-data-intelligence skill · 境外 KB YAML |

---

**建议实施顺序**：

1. ~~对话编排 Wave A/B/C~~ ✅ · ~~WS-09 / WS-08a/b / CACHE~~ ✅ · ~~WX-01 玩法可信度~~ ✅  
2. **运维 / 商务**：`SEC-01b` · `HOT-01` · 部署前 `SEC-02`（~~`OPS-01`~~ ✅）· **`COST-01` 等 Viator 审核通过拿 Key**  
3. **扩张（按需）**：`COST-02` 餐饮价位 · 完整 Tavily 网页桶 `WS-01…` · `AG-02…` · KB skill（**保持 TikHub**；Reach 仅对照）  
4. （⏸ 移动端 · WX-02/03 · Exa/Agent-Reach 生产依赖 · P5b · **COST-01 账号审核**）  

> 对话为主 / 只读摘要见 [22](./22-对话编排与玩法印证UX调研.md)。印证多源见 [21](./21-Agent-Reach与玩法印证多源实施调研.md)。偏离复核见 [20 §6](./20-L1L2运行验证记录.md)。

---

*清单版本：v1.24 · 2026-08-09 · +WS-10 贴链 MVP · 变更请同步 [总索引](../TODO.md)*
