# LLM 境外旅行数据智能获取 — 功能头脑风暴分析

> 分析日期：2026-06-30  
> 范围：**境外旅行**（境内旅行留空，待后续专项分析）  
> 参考 Skill：`find-skills`、`llm-api-engineering`  
> 对齐项目：`docs/项目分析与设计文档.md` §3.2、`frontend/src/types/itinerary.ts`、`mockSingapore.ts`

---

## 1. 结论摘要

| 维度 | 现状 | 目标 |
|------|------|------|
| **Skill 覆盖** | 无专用「旅行规划 / 旅行数据」Skill；Codex curated 列表亦无 travel 类 | 建议新建项目 Skill：`travel-data-intelligence` |
| **数据获取** | LLM 纯生成 POI + 地理编码；**无实时航班/酒店/票价 API** | Tool Calling + 结构化 API + 知识库分层 |
| **比价格** | `cost` / `cost_label` 由模型估算，易过时 | 多源报价 + 快照时间戳 + 比价维度标准化 |
| **准确性** | 坐标走 `resolve_place`；费用/通勤/办卡规则靠模型「猜」 | **事实类走 API/官方页，推理类走 LLM** |

**核心原则（境外）**：

1. **LLM 不编造可验证数字**（票价、汇率、签证政策、末班车时间）—— 必须带 `source`、`fetched_at`、`confidence`。
2. **比价需要可比维度**（同一舱等、同一取消政策、含税总价、同一入住人数/晚数）。
3. **游玩项目按品类拆 Schema**，不同品类的价格结构与注意事项完全不同。
4. **通勤分三层**：跨城（航班/高铁）、城内（公交/地铁/打车）、景区内部（缆车/渡轮）。
5. **细节清单化**：签证、保险、通讯、支付、退税、安全等作为独立「行前模块」，不塞进单个 POI 的 `tips[]`。

---

## 2. Skill 调研结果

### 2.1 本项目已安装 Skills（相关度）

| Skill | 与本题关系 |
|-------|------------|
| `llm-api-engineering` | ✅ **直接相关** — Tool Calling、结构化 JSON、SSE、Pydantic 校验 |
| `find-skills` | ✅ 用于发现/安装 Skill |
| `vercel-ai-sdk-fullstack` | 若前端对话走 AI SDK，可复用 tool 流式 |
| `ai-chat-ui` | 比价结果、Patch 确认卡 UI |
| 其余（frontend-design 等） | 与数据获取无关 |

### 2.2 外部 Skill 检索（find-skills + skill-installer）

| 来源 | 检索关键词 | 结果 |
|------|------------|------|
| Codex curated（39 个） | travel / trip / flight / hotel / itinerary | **无匹配** |
| GitHub 公开仓库 | cursor skill travel planning | **无成熟可安装项** |

**结论**：暂无现成「旅行规划 Skill」可下载；建议在 `.cursor/skills/travel-data-intelligence/` 新建项目 Skill，沉淀 API 选型、Schema 扩展、比价规则与境外行前清单（本文档可作为首版 reference）。

### 2.3 境内旅行

> **留空** — 后续单独分析：12306、携程/飞猪 API 政策、国内 OTA 合规、港澳台证件差异等。

---

## 3. 总体架构建议

```
TripRequest + 对话上下文
  → 意图路由（Planner Agent）
      ├─ search_flights      → 航班 API（多源聚合）
      ├─ search_hotels       → 酒店 API（多源 + 政策归一）
      ├─ search_activities   → 品类化活动 API
      ├─ route_transit       → Directions / GTFS / 本地交通 API
      ├─ fetch_travel_basics → 签证/汇率/时区/节假日（知识库 + 官方 RSS）
      └─ synthesize_itinerary → 输出 Itinerary JSON（现有 Schema 扩展）
  → resolve_place（已有 Geocoding）
  → Pydantic 校验 + warnings[] + meta.provenance
```

与现有实现对齐：

- 行程骨架仍输出 `Itinerary`（`days[].nodes[]`、`edges[]`）。
- **新增**可选子对象：`flight_options[]`、`hotel_quotes[]`、`activity_catalog[]`、`transit_cards[]`、`pre_trip_checklist[]`（可嵌在 `meta` 或独立 `TravelIntel` 层，见 §8）。

---

## 4. 航班信息 — 如何获取与比价

### 4.1 业务目标

- 给出 **可比较的报价矩阵**（直飞 vs 中转、不同航司、不同出发时段）。
- 标注 **总价构成**（含税、行李、选座、燃油附加）。
- 支持 **弹性日期**（±1～3 天）与 **多机场**（如伦敦 LHR/LGW/STN）。

### 4.2 推荐数据源（境外）

| 层级 | 来源 | 适用场景 | 备注 |
|------|------|----------|------|
| **GDS / 聚合** | Amadeus、Sabre、Travelport | 生产级搜索、部分可订 | Amadeus Self-Service **2026-07-17 停用**，需规划 Enterprise |
| **比价 / 元搜索** | Skyscanner、Kiwi、Google Flights（无官方 API，需合规替代） | 广覆盖比价 | 常经 RapidAPI 或 affiliate |
| **直连航司** | NDC（Lufthansa、SQ 等）、Duffel | 准确舱位与退改规则 | 接入成本高 |
| **兜底** | LLM + 联网搜索 | 仅 **趋势/参考价**，必须标 `confidence: low` | 不可作唯一报价 |

### 4.3 比价维度（必须标准化）

```typescript
interface FlightQuote {
  id: string;
  origin_iata: string;
  dest_iata: string;
  depart_at: string;        // ISO8601 + 时区
  arrive_at: string;
  airline_codes: string[];
  stops: number;
  cabin: 'economy' | 'premium_economy' | 'business' | 'first';
  price: {
    amount: number;
    currency: string;
    includes_tax: boolean;
    baggage_included: string; // e.g. "1×23kg"
  };
  fare_rules_summary?: string; // 退改简述
  booking_deep_link?: string;
  source: string;
  fetched_at: string;
}
```

**LLM 职责**：

- 解析用户约束（红眼可否、最大中转时长、偏好航司）。
- 对 API 返回的 20～50 条报价 **聚类**（同航线不同价 → 解释差异）。
- 写入行程：`category: 'airport'` 节点绑定 `flight_quote_id`，边 `transport_mode: 'flight'` 带 `duration_minutes`。

**注意事项（境外）**：

- 护照有效期（通常 ≥6 个月）、过境签（经第三国中转）。
- 廉价航空 **机场偏远**（如 STN、BGY）需在 `tips` 中加通勤成本。
- 跨时区 `day_index` 归属（凌晨抵达算 Day1 还是 Day0）。

---

## 5. 酒店信息 — 如何获取与比价

### 5.1 业务目标

- 按 **位置 × 预算 × 评分 × 取消政策** 多维筛选。
- 同一酒店多 OTA 报价对比（含会员价、预付/到店付）。
- 与行程 **区域聚类** 对齐（减少每日跨区通勤）。

### 5.2 推荐数据源

| 来源 | 优势 | 劣势 |
|------|------|------|
| **Amadeus Hotel API** | 与航班同一账号体系 | 库存因地区而异 |
| **Expedia Rapid / EPS** | 75 万+ 房源，生产质量 | 需合作伙伴资质 |
| **Booking.com Affiliate** | 内容全、中文友好 | 多为 deep link，非实时库存 API |
| **Hotels.com / Agoda API** | 亚太覆盖好 | 条款与佣金模型各异 |
| **Google Hotels / TripAdvisor** | 评价聚合 | API 受限，宜作辅助 |

### 5.3 比价维度

```typescript
interface HotelQuote {
  id: string;
  name: string;
  lat: number;
  lng: number;
  star_rating?: number;
  guest_rating?: number;      // 如 8.5/10
  check_in: string;
  check_out: string;
  room_type: string;
  occupancy: { adults: number; children: number };
  price_per_night: { amount: number; currency: string };
  total_stay: { amount: number; currency: string; includes_tax: boolean };
  cancellation: 'free_until' | 'non_refundable' | 'partial';
  cancellation_deadline?: string;
  breakfast_included: boolean;
  distance_to_anchor_km?: number; // 距当日重心 POI
  source: string;
  fetched_at: string;
}
```

**LLM 职责**：

- 根据 `DayPlan.region` 聚类选 **1 个主酒店 + 1 个备选**（`is_optional: true`）。
- 解释「贵 20% 但步行 5 分钟到地铁」类 trade-off。
- 写入 `category: 'hotel'` 节点，`cost` 用 `per: 'total'` 或 `'group'`。

**境外特别注意**：

- **城市税 / 度假村费**（欧洲、北美）常不含在 OTA 展示价内 → `price.note` 必填。
- **押金 / 预授权**（信用卡额度）。
- 入住时间（15:00 前到店存行李）、退房时间。
- 亲子：加床政策、婴儿床。

---

## 6. 游玩项目 — 品类细化、价格与注意事项

当前 Schema 仅有粗粒度 `category: attraction | landmark | restaurant | snack`。境外智能规划需 **二级品类 + 票务模型**。

### 6.1 品类矩阵

| 二级品类 | 典型示例 | 价格结构 | 关键注意事项 |
|----------|----------|----------|--------------|
| **门票景点** | 博物馆、主题乐园、观景台 | 成人/儿童/老人票；时段票 | 预约时段、闭馆日、背包规定 |
| **自然户外** | 国家公园、徒步线 | 入园费 / 免费 | 天气、装备、向导要求、闭园 |
| **演出赛事** | 音乐会、体育 | 座位分区 | 开票时间、实名、退改 |
| **体验课程** | 烹饪课、潜水 OW | 按人头 / 按组 | 最低人数、语言、证书 |
| **餐饮** | 米其林、大排档 | 人均 / 套餐 | 订位、着装、小费 |
| **购物** | 奥特莱斯、免税店 | 可变 | 退税门槛、营业日 |
| **宗教/礼仪场所** | 寺庙、清真寺 | 免费或捐赠 | 着装、摄影限制 |
| **夜间娱乐** | 酒吧、夜游 | 最低消费 | 年龄限制、安全 |

### 6.2 推荐数据源

| 品类 | API / 平台 |
|------|------------|
| 门票体验 | **Viator**、**GetYourGuide**、Klook API、Tiqets |
| 演出 | Ticketmaster、Eventbrite、当地官方（如 West End） |
| 餐厅 | Google Places、OpenTable、Tabelog（日）、Michelin Guide（静态） |
| 免费 POI | Wikidata、OpenStreetMap、官方旅游局开放数据 |

### 6.3 建议 Schema 扩展

```typescript
interface ActivityDetail {
  sub_category: 'ticketed_attraction' | 'outdoor' | 'show' | 'experience' |
                'dining' | 'shopping' | 'religious' | 'nightlife';
  booking_required: boolean;
  booking_url?: string;
  opening_hours?: Record<string, string>; // mon-sun
  closed_dates?: string[];
  duration_typical_minutes?: number;
  price_tiers?: Array<{
    label: string;           // 成人票 / 儿童票
    amount: number;
    currency: string;
    age_rule?: string;
  }>;
  restrictions?: string[];   // 禁止摄影、最低身高…
  best_visit_window?: string; // 建议 9:00 前入园
}
```

**LLM 职责**：

- 按 `preference_tags`（亲子、摄影、美食）做 **品类配额**（如每天 1 餐饮亮点 + 2 景点）。
- 冲突检测：闭馆日与 `date`、演出开场与前后节点 `start_time`。
- `tips[]` 首条 = 总览摘要（与现有 Mock 一致），其余 = 分项注意事项。

---

## 7. 通勤信息 — 方式、价格、公共交通办卡

### 7.1 三层通勤模型

| 层级 | 范围 | 数据需求 | 现有 Schema |
|------|------|----------|-------------|
| **L1 跨城** | 国际航班、欧铁、长途巴士 | §4 航班 + Rail API | `transport_mode: 'flight'` |
| **L2 城内** | 地铁、公交、有轨、轮渡 | Directions API、GTFS | `subway` / `bus` / `ferry` |
| **L3 最后一公里** | 步行、打车、共享单车 | OSRM / Google Directions | `walk` / `taxi` |

### 7.2 路线与票价 API

| 地区 | 路线规划 | 实时数据 |
|------|----------|----------|
| **全球兜底** | Google Directions、Mapbox Directions、OSRM | 精度因城市而异 |
| **新加坡** | LTA **DataMall**（免费注册 Account Key） | 公交/地铁到站 |
| **日本** | **Navitime**、JR 时刻表、GTFS（部分城市） | 无统一 IC 卡 API |
| **欧洲** | DB、SNCF、Omio | GTFS 多国 |
| **英美** | TfL API（伦敦 Oyster）、MBTA V3（波士顿） | 实时到站 |

**LLM 不应单独估算** `duration_minutes`：优先 API，失败时在 `meta.warnings` 标注「时间为估算」。

### 7.3 公共交通办卡 / 票务（境外知识库）

IC 卡/通票 **无全球统一 API**，宜维护 **目的地知识库**（JSON/YAML + 定期人工审核）：

| 目的地 | 卡/票类型 | 是否必须办卡 | 典型费用 | 备注 |
|--------|-----------|--------------|----------|------|
| 新加坡 | EZ-Link / SimplyGo / **Singapore Tourist Pass** | 否（可 tap 银行卡） | STP 1 日 S$17 起 | 机场/地铁站购买 |
| 日本 | Suica / PASMO / **Tourist PASMO** / Welcome Suica | 强烈建议 | 押金/有效期因卡种而异 | 2026 起 Tourist PASMO 机场专售 |
| 伦敦 | Oyster / Contactless cap | 否（contactless 有日封顶） | 按 zone 计费 | 儿童优惠 |
| 香港 | 八达通 | 建议 | HK$50 含押金 | 与 MTR 一体 |
| 首尔 | T-money | 建议 | ₩2500 卡费 | 便利店充值 |
| 欧洲多国 | Eurail / 各国通票 | 视行程 | — | 与市内 IC 卡分离 |

建议结构：

```typescript
interface TransitCardGuide {
  destination_country: string;
  card_name: string;
  required: boolean | 'recommended' | 'optional';
  purchase_locations: string[];
  initial_cost: NodeCost;
  top_up_note?: string;
  tourist_pass_alternative?: {
    name: string;
    daily_price: NodeCost;
    coverage: string;
  };
  contactless_alternative?: string;
  official_url: string;
  last_verified: string;
}
```

**写入行程的方式**：

- Day1 增加 `category: 'transit'` 节点「购买 EZ-Link / STP」。
- 或在 `meta.warnings` / 独立 `pre_trip_checklist` 中列出。

### 7.4 边（Edge）增强

现有 `ItineraryEdge` 可扩展：

```typescript
interface ItineraryEdge {
  // ...existing
  fare_estimate?: NodeCost;
  line_names?: string[];       // 如 "EW Line"
  transfers?: number;
  first_train?: string;
  last_train?: string;
  requires_transit_card?: string; // EZ-Link
}
```

---

## 8. 旅行中需考虑的全部细节（补充清单）

以下模块建议作为 **行前 Intel**，不全依赖 POI 级 `tips`：

### 8.1 证件与入境

| 项目 | LLM + 数据源 |
|------|--------------|
| 签证 / 免签 / eVisa | 外交部 / 目的地移民局 API 或结构化知识库 |
| 护照有效期、空白页 | 规则引擎 |
| 入境卡 / 海关申报（现金上限） | 国家별模板 |
| 国际驾照 / 当地驾照 | 自驾场景 |
| 过境签（第三国中转） | 与航班模块联动 |

### 8.2 健康与安全

- 疫苗要求（黄热病等）、旅行保险（医疗、延误、行李）。
- 紧急号码（警察/急救/中国驻外使领馆）。
- 治安热点、自然灾害季（台风、野火）、政治动荡提示（引用官方旅行建议，如 中国领事保护、英美 FCDO）。

### 8.3 金钱与支付

- 当地货币、刷卡普及度、小费文化。
- 汇率与 **手续费**（动态 API：exchangerate.host、央行）。
- 退税（VAT/Tax Free）流程、最低消费、机场退税柜台位置。
- 预授权、动态货币转换（DCC）陷阱。

### 8.4 通讯与数字化

- eSIM / 本地 SIM（Airalo 类 API 或静态套餐表）。
- 离线地图、翻译 App、打车 App（Grab/Bolt/Uber 可用性）。
- 电源插头与电压（Type A/C/G…）。

### 8.5 时间与节奏

- 时区、夏令时（DST）切换日。
- 当地公共假日（商店闭店）—— **Calendarific / Nager.Date API**。
- 营业时间文化（南欧 siesta、周日歇业）。

### 8.6 行李与物品

- 航司行李额度（与 §4 联动）。
- 液体登机限制、充电宝 WH 上限。
- 气候对应衣物（与 `DayWeather` 联动，未来接真实 Weather API）。

### 8.7 文化与礼仪

- 着装（宗教场所）、摄影限制、小费比例。
- 禁忌（手势、礼物、话题）。

### 8.8 特殊人群

- 亲子：推车友好、亲子房间、儿童票规则。
- 无障碍：轮椅、电梯（GTFS `facilities`）。
- 饮食：清真、素食、过敏原（餐厅节点 `tags`）。

### 8.9 变更与应急

- 航班延误/取消 → 后续节点自动后移建议。
- 酒店 no-show 政策。
- 备用日（rain plan）—— 与 `weather.icon` 联动室内备选。

---

## 9. LLM 实现模式（结合 llm-api-engineering）

### 9.1 分层 Agent（推荐）

| Agent | 工具 | 输出 |
|-------|------|------|
| **Planner** | 路由、预算校验 | 任务 DAG |
| **Flight** | `search_flights` | `FlightQuote[]` |
| **Hotel** | `search_hotels` | `HotelQuote[]` |
| **Activity** | `search_activities` | 带 `ActivityDetail` 的节点 |
| **Transit** | `route_transit`, `get_transit_card_guide` | 增强 `edges[]` |
| **Compliance** | `get_visa_rules`, `get_holidays` | `pre_trip_checklist[]` |
| **Synthesizer** | 无（仅组装） | `Itinerary` JSON |

### 9.2 数据可信度标记

```typescript
type DataProvenance = {
  source: 'api' | 'official_kb' | 'llm_estimate' | 'user';
  fetched_at?: string;
  confidence: 'high' | 'medium' | 'low';
  url?: string;
};
```

**规则**：

- `api` + `high` → 可展示为「参考价」。
- `llm_estimate` → 必须显示「估算，请以预订页为准」。
- 解析失败 → 422，**不静默降级**（与 `llm-api-engineering` 一致）。

### 9.3 Prompt 要点（境外）

1. System：角色 + **禁止编造票价** + JSON Schema。
2. User：注入 `TripRequest`、已选报价 ID、预算上限。
3. 工具结果以 **结构化 JSON** 回灌，而非原始 HTML。
4. `supplement` 模式改酒店/航班时，重新触发对应 Agent，而非全文重写。

### 9.4 性能与成本

- 航班 + 酒店 + 活动 **并行** `asyncio.gather`（参考 TravelMate 模式）。
- 缓存：同 `(origin, dest, date, pax)` 报价缓存 15～30 分钟。
- 流式：先返回骨架 `days[]`，再 SSE 推送 `quotes` 补丁（扩展 event type）。

---

## 10. 与现有 Itinerary Schema 的映射

| 新 intel | 映射位置 | 优先级 |
|----------|----------|--------|
| 航班报价 | `cross_day_edges` + Day1 `airport` 节点 metadata | P0 |
| 酒店报价 | `hotel` 节点 `cost` + 备选 `is_optional` | P0 |
| 活动详情 | `attraction` / `landmark` 扩展 `activity_detail` | P1 |
| 通勤票价 | `edges[].fare_estimate` | P1 |
| 交通卡指南 | Day1 `transit` 节点或 `meta.transit_cards[]` | P1 |
| 行前清单 | `meta.pre_trip_checklist[]` 或新顶层 `TravelIntel` | P2 |
| 数据来源 | `meta.provenance[]` | P0 |

**最小侵入方案**：先在 `ItineraryMeta` 扩展：

```typescript
interface ItineraryMeta {
  // existing...
  flight_quotes?: FlightQuote[];
  hotel_quotes?: HotelQuote[];
  transit_guides?: TransitCardGuide[];
  pre_trip_checklist?: Array<{ category: string; items: string[] }>;
  provenance?: DataProvenance[];
}
```

---

## 11. 实施路线图（建议）

| 阶段 | 内容 | 产出 |
|------|------|------|
| **P0** | Amadeus/Skyscanner 航班 + 酒店 sandbox；报价写入 `meta` | 可比价 MVP |
| **P1** | Viator/Klook 活动；Google Directions 通勤 | 品类化 POI |
| **P2** | 交通卡/签证知识库（新、日、欧首批） | 行前清单 |
| **P3** | 弹性日期比价、预算 Agent、延误重排 | 智能优化 |
| **P4** | 境内旅行专项（留空） | — |

---

## 12. 风险与合规

- **API 条款**：OTA 报价展示需遵守 affiliate 披露；禁止缓存禁止字段。
- **Amadeus Self-Service 停用**（2026-07-17）：尽早评估 Enterprise 或 Duffel。
- **个人数据**：护照号不进 prompt；日志脱敏（`llm-api-engineering` 安全清单）。
- **价格误导**：界面强制展示 `fetched_at` 与免责声明。

---

## 13. 待办：新建 Skill 建议

在 `.cursor/skills/travel-data-intelligence/SKILL.md` 中固化：

- 本文 §4～§8 的 API 选型表
- `FlightQuote` / `HotelQuote` / `ActivityDetail` Schema
- 「事实 vs 估算」判定规则
- 境外首批知识库目的地：**新加坡**（与现有 Mock 对齐）、日本、泰国

---

## 附录 A：新加坡示例（与 mockSingapore 对齐）

| 模块 | 智能增强点 |
|------|------------|
| 航班 | 樟宜 T1/T2/T3 + `scene_group` 已与多航站楼场景匹配；可绑 SIN 往返报价 |
| 酒店 | 滨海湾金沙 — 补充 `resort_fee`、无边泳池时段 |
| 活动 | Jewel 免费 vs 部分付费项目；环球影城需预约 |
| 通勤 | T2→市区地铁 EW/DT 线；`fare_estimate` ~S$2–3；STP vs EZ-Link 决策 |
| 细节 | 免签 30 天、英式插头、Grabb 可用、禁止口香糖入境 |

## 附录 B：境内旅行（占位）

<!-- 待专项分析：12306、国内 OTA、港澳通行证、国内交通卡（一卡通/乘车码）等 -->

---

*文档版本：v1.0 · 生成方式：Skill 头脑风暴 + 项目 Schema 对照 + 外部 API 调研*
