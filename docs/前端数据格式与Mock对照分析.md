# 前端数据格式与 Mock 对照分析

> 分析日期：2026-06-30  
> 范围：`frontend/src/types/*`、运行时 Store / localStorage、API 管线，与 `frontend/src/data/mockSingapore.ts` 的对照  
> 参考：设计文档 §3.5 / §6、`llm-api-engineering` skill（结构化输出与 Schema 分层）

---

## 1. 结论摘要

前端实际使用的数据是 **两层模型**：

| 层级 | 类型 | 持久化 | 职责 |
|------|------|--------|------|
| 计划层 | `TravelPlan` | ✅ localStorage | 用户意图、对话、Patch 队列、表单布局 |
| 行程层 | `Itinerary` | ✅ 嵌在 `TravelPlan.itinerary` | 路线图 / 地图 / 总览的唯一数据源 |

`mockSingapore.ts` **在 TypeScript 层面完全符合** `Itinerary` 类型，且是前端 Mock 的「黄金样本」——比 LLM 生成结果、比后端 `mock_singapore.json` **更完整**。  
运行时数据会在 Mock/API 结果之上叠加 **地理编码、区域补全、UI 布局字段**，并与 Zustand 中的 **纯 UI 状态** 混用，这是当前格式与 Mock 之间的主要「出入」来源。

---

## 2. 前端数据格式总览

### 2.1 持久化结构（localStorage）

键名：`travel_plans_v1`（命名遗留，内容已是 v2）

```typescript
interface StoragePayload {
  version: 2;
  active_plan_id: string;
  plans: TravelPlan[];
  left_panel_mode?: 'chat' | 'form';
}
```

加载时会执行迁移：

- `pending_patches` → `normalizeFormPatch()` 规范化
- `itinerary` → `migrateItineraryCrossDayEdges()` 补全跨日边

设计文档 §6.6 仍写 `version: 1`，与实现不一致。

### 2.2 TravelPlan（计划层）

定义：`frontend/src/types/travelPlan.ts`

```typescript
interface TravelPlan {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  phase: 'empty' | 'planning' | 'detailed';  // 由 trip_request + itinerary 派生
  trip_request: TripRequest;                  // 输入层，与 Itinerary 分离
  itinerary: Itinerary | null;                // 生成/编辑结果
  chat_messages: ChatMessage[];
  pending_patches: FormPatch[];
  form_layout?: FormLayoutState;
  last_chat_mode?: 'global' | 'supplement';
}
```

**phase 规则**（`planHelpers.derivePhase`）：

- 有 `itinerary.days.length > 0` → `detailed`
- 否则若 trip_request 有任何有效输入 → `planning`
- 否则 → `empty`

Mock 数据 **不包含** TravelPlan 外壳；通过 `buildMockItinerary()` 只产出 `Itinerary`，再写入当前计划的 `itinerary` 字段。

### 2.3 TripRequest（输入层）

定义：`frontend/src/types/tripRequest.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `free_text` | string | 自然语言描述 |
| `destination` | string | 目的地（生成/mock 标题来源） |
| `departure` | string? | 出发地 |
| `date_start` / `date_end` | string? | YYYY-MM-DD |
| `day_count` | number? | 天数；Mock 截断依据 |
| `travelers` | number? | 人数 |
| `budget_level` | economy/comfort/luxury? | 预算档 |
| `preference_tags` | string[] | 偏好标签 |
| `notes` | string? | 补充约束 |

与 `Itinerary` 的关系：**单向同步**。确认 patch 或编辑 days 后，`tripRequestDatesPatch()` 会把 `day_count / date_start / date_end` 写回 TripRequest；但 Mock/API 生成行程时 **不会** 严格使用 TripRequest 的日期（见 §4.2）。

### 2.4 Itinerary（行程层 — 核心）

定义：`frontend/src/types/itinerary.ts`

```
Itinerary
├── id, title, destination, timezone
├── days: DayPlan[]
├── cross_day_edges?: ItineraryEdge[]   // 总览跨列虚线弧（设计 §6.4 已引用，§6.2 接口块未列出）
└── meta: ItineraryMeta
```

#### DayPlan

| 字段 | 必填 | 说明 |
|------|------|------|
| `day_index` | ✅ | 从 1 开始 |
| `date` | ✅ | YYYY-MM-DD |
| `weekday` | ✅ | 中文星期 |
| `label` | ✅ | Tab / 列头展示 |
| `region` | — | 当日主区域；节点缺 region 时的默认值 |
| `weather` | — | 含 `source?: llm \| manual \| api` |
| `nodes` | ✅ | 当日 POI 节点 |
| `edges` | ✅ | 当日内 primary / alternative 连线 |

#### ItineraryNode

| 字段 | 必填 | 来源 / 用途 |
|------|------|-------------|
| `id, name, category, lat, lng, is_optional` | ✅ | 地图 + 图节点 |
| `region` | 运行时必填 | 总览行定位；`ensureItineraryNodeRegions()` 写入 |
| `start_time, end_time, duration_minutes` | — | 时间轴 / 总览时间展示 |
| `tips, tags, cost_label, cost` | — | 展示与筛选 |
| `scene_group` | — | 同组 ≥2 节点显示虚线框（机场 T1/T2） |
| `floor, address` | — | 编辑 / 地理编码 |
| `coord_confidence, coord_source` | — | §3.6 坐标确认流 |
| `position` | — | 单日路线图拖拽坐标（持久化在 itinerary 内） |
| `overview_offset` | — | 总览图拖拽偏移（持久化在 itinerary 内） |

#### ItineraryEdge

| 字段 | 必填 | 说明 |
|------|------|------|
| `id, from, to, type, transport_mode, duration_minutes` | ✅ | `type`: primary \| alternative |
| `label, depart_time, arrive_time, distance_meters` | — | 标注与时刻 |

### 2.5 非 JSON 的 UI 状态（Zustand）

以下 **不在** `Itinerary` / `TravelPlan` 内，刷新后丢失（除 localStorage 内的 plan 数据）：

| 状态 | 位置 | 说明 |
|------|------|------|
| `overviewColumnWidths` | `usePlanStore` | 总览列宽 |
| `itineraryHistories` | `usePlanStore` | 撤销/重做栈 |
| `activeDayIndex`, `selectedNodeId`, `graphViewMode` 等 | `usePlanStore` | 浏览/选中态 |

---

## 3. mockSingapore.ts 与类型定义的对照

### 3.1 符合度

`mockSingaporeItinerary` 显式标注 `Itinerary` 类型，**编译期校验通过**，字段集合是类型的 **超集使用**（用了大量可选字段，未违反必填约束）。

Mock 中 **已填充** 而类型仅标记可选的字段：

- 节点：`floor`, `duration_minutes`, `tips`, `tags`, `cost_label`, `cost`, `scene_group`, `coord_confidence`, `region`
- 边：`label`, `depart_time`, `arrive_time`, `type: alternative`
- 日：`weather.source: 'llm'`
- 根：`cross_day_edges`（3 条跨日衔接）

Mock **未使用** 但类型已声明的字段：

- `address`, `coord_source`, `position`, `overview_offset`, `distance_meters`

这些字段留给 **地理编码、地图选点、图拖拽** 等运行时路径。

### 3.2 Mock 的数据特征（作为「富样本」）

相对设计文档 §6.5 最小示例，Mock 额外演示了：

1. **备选分支图**：`d1-n1b` + `d1-e1b`（alternative）、`d1-n4` 备选餐厅
2. **场景分组**：`scene_group: '樟宜机场'`（T1/T2）
3. **标签体系**：`tags: ['交通', '必去', '美食', …]`
4. **结构化费用**：`cost: { amount, currency, per, note }` 与 `cost_label`
5. **跨日拓扑**：`cross_day_edges` 连接日末/日首节点（含酒店隔夜）
6. **多区域同日**：Day1 节点跨樟宜 / 牛车水 / 滨海湾

### 3.3 Mock 内部数据质量问题

| 问题 | 位置 | 说明 |
|------|------|------|
| 日期不连续 | Day1 `2026-10-16` → Day2 `2026-10-18` | 缺少 10-17；`weekday` 与真实日历一致但未连续 |
| 重复 POI 多 ID | `d1-n5` 与 `d2-n1` 同为滨海湾金沙 | 有意模拟「隔夜酒店」；跨日边 `xd-e1` 连接两者 |
| 坐标置信度不一致 | `d1-n4` 为 `medium`，Mock meta 警告写的是松发肉骨茶 | 警告与节点未精确对应 |

---

## 4. mockSingapore 与运行时实际数据的出入

### 4.1 三条数据来源对比

| 维度 | mockSingapore（前端 Mock） | API / LLM 生成 | 用户编辑后 |
|------|---------------------------|----------------|------------|
| 坐标 | 真实 lat/lng，`coord_confidence: high` | 初始 `lat/lng=0`，`coord_confidence: none` | geocode / 手动选点 |
| 边结构 | 多 primary + alternative，含时刻 | 仅相邻节点 primary walk，20min 默认 | `edgeMutations` 增删改 |
| cross_day_edges | 手工 3 条，含语义 label | 自动：前日末节点 → 次日首节点 | `rebuildCrossDayEdges()` |
| scene_group / tags | 有 | **无**（LLM schema 未包含） | 表单编辑器可写 |
| weather.source | `'llm'` | `'llm'` | 手改可为 `'manual'` |
| timezone | `Asia/Singapore` | 硬编码 `Asia/Singapore` | 未暴露编辑 |
| date / weekday | 固定 2026-10 样本 | `date.today() + i` 推算 | 表单改 date 会重算 weekday |
| meta.model | `'mock'` | LLM 模型名 | 不变或 sync 时更新 title |

### 4.2 前端 Mock 管线

```
trip_request
  → buildMockItinerary()     // utils/mockItinerary.ts
  → 深拷贝 mockSingapore
  → 按 day_count 截断 days / edges / cross_day_edges
  → 新 UUID、更新 title / destination / meta.generated_at
  → setItinerary → syncItineraryMeta → ensureItineraryNodeRegions
```

**不会** 走 geocode（坐标已完整）；与 API 路径不同。

### 4.3 API 生成管线

```
trip_request
  → POST /api/v1/itineraries/generate/stream
  → itinerary_llm._llm_to_itinerary()
  → normalize_node_regions()（后端）
  → 前端 setItinerary
  → runBackgroundGeocode()（默认 geocode=false 时也异步补坐标）
  → syncItineraryMeta + ensureItineraryNodeRegions
```

LLM 输出 Schema（`_LLMNode`）**远小于**前端 `ItineraryNode`：无 `tags`、`scene_group`、`edges` 细节、无 `cost` 对象（仅 `cost_label`）。

### 4.4 后端 Mock 与前端 Mock 不同步

| 项目 | frontend/mockSingapore.ts | backend/mock_singapore.json |
|------|---------------------------|-----------------------------|
| Day1 节点数 | 6（含 `d1-n1b` T2 备选） | 5（无 T2 备选） |
| Day1 边 | 5（含 `d1-e1b`） | 4 |
| scene_group | ✅ 机场分组 | ❌ 无 |
| tags | ✅ 多处 | ❌ 无 |
| cost / cost_label | ✅ 部分节点 | ❌ 无 |
| weather.source | ✅ 每天 | ❌ 无 |

后端 `itinerary_generate.build_itinerary()` 读 JSON；前端 `buildMockItinerary()` 读 TS。**同一「新加坡 Mock」有两份 diverged 源**，API fallback 与前端离线 Mock 体验不一致。

### 4.5 FormPatch / compact 与完整 Itinerary 的裁剪

**supplement 模式** 发给 parse 的行程经 `compactItineraryForParse()` 裁剪，仅保留：

- 节点：`id, name, category, start_time, end_time, is_optional, region`
- 边：`id, from, to, type, transport_mode, duration_minutes, label`
- cross_day：省略 `type` 字段

LLM 上下文 **看不到** tags、tips、cost、scene_group、坐标——与 Mock 富样本不对等，可能影响 supplement 回答质量。

**FormPatch 可写字段**（`NODE_SETTABLE_FIELDS`）不含：

- `scene_group`, `address`, `duration_minutes`, `lat/lng`, `overview_offset`

这些仅能通过表单 UI 的 `updateNode()` 直接改，chat patch 无法触达。

---

## 5. 数据流关系图

```mermaid
flowchart TB
  subgraph input [输入层]
    TR[TripRequest]
    CHAT[ChatMessage + FormPatch]
  end

  subgraph core [行程层 Itinerary]
    DAYS[DayPlan[]]
    NODES[ItineraryNode]
    EDGES[ItineraryEdge]
    XDE[cross_day_edges]
  end

  subgraph enrich [运行时 enrich]
    GEO[geocode API]
    REG[ensureItineraryNodeRegions]
    META[syncItineraryMeta]
  end

  subgraph ui [UI 态 不持久或部分持久]
    POS[position / overview_offset]
    COL[overviewColumnWidths]
  end

  TR -->|generate / mock| DAYS
  CHAT -->|confirm patch| DAYS
  DAYS --> NODES
  DAYS --> EDGES
  DAYS --> XDE
  NODES --> GEO
  GEO --> NODES
  DAYS --> REG
  TR --> META
  META --> DAYS
  NODES --> POS
  COL -.->|仅 Zustand| ui
```

---

## 6. 优化建议

按优先级排列，每条附理由。

### P0 — 一致性与可维护性

#### 6.1 统一 Mock 单一数据源

**建议**：只保留一份 `mock_singapore.json`（或 YAML），前后端/build 脚本共同引用；TS 类型用 `satisfies Itinerary` 导入 JSON。

**理由**：当前前端多 `d1-n1b`、tags、scene_group，后端 fallback Mock 更瘦，导致「同按钮不同环境看到不同图结构」，增加调试成本。

#### 6.2 后端 Itinerary 使用 Pydantic 强类型

**建议**：在 `backend/app/schemas/itinerary.py` 定义与前端同构的 `Itinerary` / `DayPlan` / …，generate/geocode 出参校验；LLM 中间层保持精简 `_LLMItinerary`，显式 `_llm_to_itinerary()` 映射。

**理由**：现后端 `dict[str, Any]` 无编译期保障，与 `llm-api-engineering` skill 要求的「Schema 分层 + 校验」不符；前后端 drift 难以及早发现。

#### 6.3 同步更新设计文档 §6

**建议**：在 `Itinerary` 接口块补充 `cross_day_edges`；在 `ItineraryNode` 补充 `tags`, `scene_group`, `overview_offset`；localStorage `version: 2`。

**理由**：文档与代码不一致时，新功能（总览、场景组）缺乏契约依据。

---

### P1 — 生成质量与业务正确性

#### 6.4 日期应从 TripRequest 推导

**建议**：`_llm_to_itinerary()` 使用 `date_start`（或 `date_end - day_count`）生成 `days[].date`，而非 `date.today()`。

**理由**：Mock 与用户表单日期意图脱节；排序、导出、与真实出行日历对齐会错。

#### 6.5 timezone 随 destination 解析

**建议**：维护目的地 → IANA timezone 映射表，或 geocode 国家级时写入；避免所有城市硬编码 `Asia/Singapore`。

**理由**：类型字段已存在，硬编码限制多目的地产品化。

#### 6.6 扩展 LLM 输出：备选边与 scene_group

**建议**：在 generate prompt 中允许 optional 节点 + alternative 边；同址多终端（机场 T1/T2）用 `scene_group` 分组。

**理由**：Mock 演示的核心 UX（备选餐厅、机场分组）LLM 路径完全缺失，生成结果图拓扑远弱于 Mock。

#### 6.7 统一节点停留时长语义

**建议**：约定 `duration_minutes` 与 `start_time/end_time` 互推规则（以一个为 canonical，另一个 derived）；校验不一致时 warnings。

**理由**：Mock 中 Jewel 同时有 end-start 与 duration_minutes；无约束时编辑与总览时长可能矛盾。

---

### P2 — 模型分层与 Patch 能力

#### 6.8 拆分 UI 布局字段

**建议**：将 `position`、`overview_offset` 迁至 `TravelPlan.ui_layout?: { node_layout: Record<nodeId, …> }` 或独立 `layout` 子对象；`compactItineraryForParse` 继续排除。

**理由**：布局态与行程语义混合后，LLM parse、导出、fork_plan 会携带无意义坐标偏移；也增大 localStorage 体积。

**权衡**：需迁移脚本 + 更新 `layoutOverview` / `layoutNodes` 读取路径。

#### 6.9 扩展 FormPatch 白名单

**建议**：将 `scene_group`, `duration_minutes`, `address` 纳入 `NODE_SETTABLE_FIELDS`；supplement prompt 说明可 patch 这些字段。

**理由**：编辑器已支持，chat 补充却无法修改，交互割裂。

#### 6.10 compactItineraryForParse 增补关键字段

**建议**：至少加入 `tips[0]`、`cost_label`、`scene_group`；cross_day 保留 `type`。

**理由**：supplement 场景常问「改 tips / 换分组 / 费用」，当前裁剪过狠。

---

### P3 — 数据建模进阶

#### 6.11 POI 引用去重（可选）

**建议**：引入 `place_id` 或 `canonical_node_id`，跨天同一酒店共享实体，日间只引用。

**理由**：Mock 中金沙酒店两节点 + cross_day 边模拟隔夜；更干净的做法是单一 POI + 「入住/退房」时间片，减少 geocode 重复与改名不同步。

**权衡**：图模型复杂度上升，需评估总览/单日图展示逻辑改动量。

#### 6.12 前端加载时 Schema 校验

**建议**：用 Zod 从 `itinerary.ts` 生成 runtime validator，loadPlansFromStorage / setItinerary 时校验并 strip 未知字段。

**理由**：localStorage 与 API 历史版本混杂，静默脏数据会导致图布局异常。

#### 6.13 区域枚举 vs 自由文本

**建议**：`region` 维持自由文本但增加 `region_aliases` 或归一化函数；LLM 与 Mock 用同一区域词表。

**理由**：总览按 region 分行，「市中心 / 市区 / CBD」之类同义不同名会产生空行或重复行。

---

## 7. 字段对照速查表

### 7.1 ItineraryNode 字段 × 数据来源

| 字段 | mockSingapore | LLM 生成 | Geocode | 表单 UI | FormPatch |
|------|:-------------:|:--------:|:-------:|:-------:|:---------:|
| id, name, category | ✅ | ✅ | — | ✅ | add_node |
| lat, lng | ✅ | 0,0 | ✅ | 地图选点 | ❌ |
| is_optional | ✅ | ✅ | — | ✅ | ✅ |
| region | ✅ | ✅ | — | ✅ | ✅ |
| start/end_time | ✅ | ✅ | — | ✅ | ✅ |
| duration_minutes | ✅ | ❌ | — | ✅ | ❌ |
| tips, tags | ✅ | tips | — | ✅ | tips ✅ / tags ✅ |
| cost_label, cost | ✅ | label only | — | ✅ | ✅ |
| scene_group | ✅ | ❌ | — | ✅ | ❌ |
| floor | ✅ | ✅ | — | ✅ | ✅ |
| address | ❌ | ❌ | ✅ | ✅ | ❌ |
| coord_* | ✅ | none | ✅ | ✅ | ❌ |
| position | ❌ | ❌ | — | 拖拽 | ❌ |
| overview_offset | ❌ | ❌ | — | 总览拖拽 | ❌ |

### 7.2 三份 Mock 节点规模

| 天 | frontend mockSingapore | backend mock_singapore.json |
|----|:----------------------:|:---------------------------:|
| Day1 nodes | 6 | 5 |
| Day1 edges | 5 | 4 |
| 全程 cross_day | 3 | 3 |

---

## 8. 相关代码索引

| 用途 | 路径 |
|------|------|
| 类型定义 | `frontend/src/types/itinerary.ts`, `travelPlan.ts`, `tripRequest.ts` |
| Mock 样本 | `frontend/src/data/mockSingapore.ts` |
| Mock 构建 | `frontend/src/utils/mockItinerary.ts` |
| 后端 Mock | `backend/app/data/mock_singapore.json`, `itinerary_generate.py` |
| LLM → Itinerary | `backend/app/services/itinerary_llm.py` |
| 区域补全 | `frontend/src/utils/nodeRegion.ts`, `backend/.../itinerary_normalize.py` |
| 跨日迁移 | `frontend/src/utils/itineraryMigrate.ts`, `dayOrderMutations.ts` |
| Parse 裁剪 | `frontend/src/utils/compactItineraryForParse.ts` |
| 持久化 | `frontend/src/utils/storage.ts` |
| 状态中心 | `frontend/src/stores/usePlanStore.ts` |

---

## 9. 建议实施顺序

1. **统一 Mock 文件**（P0，低成本高收益）
2. **文档 §6 补全 + 日期/timezone 修正**（P0/P1）
3. **后端 Pydantic Itinerary**（P0，为后续校验打基础）
4. **compact / FormPatch 扩展**（P2，改善 supplement 体验）
5. **UI 布局字段拆分**（P2，需迁移设计）
6. **POI 去重 / Zod 校验**（P3，产品化阶段）

---

*本文档由代码静态分析与 Mock 对照生成，未运行 E2E 测试。若后续修改类型或 Mock，请同步更新 §7 对照表。*
