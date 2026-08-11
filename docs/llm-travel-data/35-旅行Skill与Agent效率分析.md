# 35 · 旅行 Skill 能否提升 Agent 效率 · 外部对照

← [00-概述](./00-概述与架构.md) · [24-GitHub调研](./24-GitHub旅行Agent调研与机酒玩法顺序讨论.md) · [34-印证借鉴](./34-玩法印证与节点借鉴分析结论.md) · [TODO](./TODO.md)

> **日期**：2026-08-11 · **版本**：v1.1  
> **性质**：分析 + **开发 skill 已落地**  
> **触发**：玩法/印证讨论后，问「写 skill 能否提升 agent 效率」并找高分旅行 skill 参考。  
> **v1.1**：已实现 `.cursor/skills/travel-product-flow/`（见 §3.1）。

---

## 0. 结论摘要

| # | 结论 |
|---|------|
| 1 | **可以写 skill，且对 Cursor 开发 Agent 有用**：把机酒门禁、印证部分借鉴、封闭池、禁止事项压成可触发 SOP，减少每次重读 18/24/34 与走偏。 |
| 2 | **分清两种 skill**：① **产品运行时**（用户侧生成玩法）— skill **不能替代**封闭 POI / 代码执法；② **仓库开发时**（改 generate / 住宿 / 印证）— skill **最有增益**。 |
| 3 | GitHub **几乎没有高星「旅行 SKILL.md」仓**；VoltAgent/awesome 万星级是技能目录，旅行条目稀少。可参考的是 **结构好、星数低** 的 Claude Agent Skills。 |
| 4 | **不要整仓引入** 通用 trip-planner skill 当本产品大脑；与 [25](./25-GitHub能力借鉴与规划策略三档分析.md)「不借多角色搜网写行程」一致。 |
| 5 | ✅ 已建项目级 **`travel-product-flow`**；可选拆 `travel-evidence-borrow` 暂缓。`B-SK-01` 对齐本 skill；KB YAML 仍低于封闭池。 |

---

## 1. Skill 能提效什么、不能提效什么

| 场景 | Skill 是否帮得上 | 说明 |
|------|------------------|------|
| Cursor 改本仓：生成门禁、印证、住宿、GEO | ✅ **高** | 触发词加载「先读哪些文件 / 禁止做什么 / 验收」 |
| Cursor 实现封闭池 / evidence_refs | ✅ **中高** | 把 24/34 目标态写成步骤，避免又写成「再加一段 prompt」 |
| 用户在 App 里点「生成玩法」更准 | ❌ **几乎不** | 运行时不走 Cursor skill；靠后端管道 |
| 用公开 travel-planner skill 直接当玩法引擎 | ❌ | 仍是 LLM+搜网；与本仓机酒硬锚、印证分层冲突 |

```text
提效对象 = 写代码的 Agent（开发效率 / 少走弯路）
≠ 运行时行程质量（那要靠封闭池 + 印证求交 + 执法）
```

本仓已有：`.cursor/skills/`（工程类）+ `.agents/skills/rollinggo-hotel-booking`（酒店 MCP）。**缺的是「本产品流程契约」类 skill**，不是再装一个通用「帮我规划东京三日游」。

---

## 2. GitHub / 目录检索实况

### 2.1 「高分」现实

| 来源 | 旅行相关结果 |
|------|----------------|
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)（约 3 万★） | 官方/社区技能总表；**旅行专项极少**，非高星 travel skill 榜 |
| Codex curated / 早期 [00](./00-概述与架构.md) 检索 | travel/trip/flight/hotel **无成熟可装项** |
| 独立仓「Travel * Skill」 | 多为 **1–数星**；质量看结构，不看 star |

高星旅行仓（如 [24](./24-GitHub旅行Agent调研与机酒玩法顺序讨论.md) 的 nirbar）是 **Agent/App**，不是可安装 `SKILL.md` 包。

### 2.2 值得读的参考（结构优先，非星数）

| 项目 | ★约 | 形态 | 可借模式 | 不借 / 慎用 |
|------|-----|------|----------|-------------|
| [618034128/Travel-Planning-Skill](https://github.com/618034128/Travel-Planning-Skill) | ~2 | Intake→**Confirm**→Build→Revise；`references/` + map 脚本 | **确认后再生成**；默认填空再展示；query≠下单；中国/国际地图分流 | 整套当本仓运行时；境内 12306 主路径 |
| [apljacob/travel-agent](https://github.com/apljacob/travel-agent) | ~2 | 7 阶段精英规划师；联网再断言；**pushback 表** | 发现一次问清；每日 anchor+backup；反对「十二城十日」类坏主意；预订追踪不代订 | PDF 交付物整搬；与机酒 Panel 抢流程 |
| [cuga-project … travel_planner](https://github.com/cuga-project/cuga-apps/blob/main/cuga-skills/travel_planner/SKILL.md) | （随 monorepo） | Wiki→天气→geocode→OpenTripMap→Tavily→写 | **先工具/数据后写行程**（对齐 24 架构 C） | 把 OpenTripMap 当唯一池不经本仓围栏 |
| [agentskill.sh samjale/travel-planner](https://agentskill.sh/@samjale/travel-planner) | 目录项 | SearchAPI 飞/酒/景拼装 + HTML | API 先行拼装思路 | Key/供应商与本仓 Ignav/RollingGo/Trip 重复 |
| [kyzdes/trip-planner-skill](https://github.com/kyzdes/trip-planner-skill) | 低 | 从 OTA 链接刮航班酒店出 HTML | 机酒「人已选报价再沉淀」的旁路灵感 | **爬虫主路径**本仓不做 |

### 2.3 这些 skill 的共性（可迁移到本仓 skill 写法）

1. **确认门闩**：未确认规格不进入昂贵生成（对齐你们 checklist / 机酒硬门禁）。  
2. **references 拆分**：主 `SKILL.md` 短；清单/模板/边界进 `references/`。  
3. **数据/工具先于散文**：geocode、天气、POI、搜网 → 再写日程。  
4. **查 ≠ 订**：只推荐与深链，不代下单（对齐 Trip/RollingGo CTA）。  
5. **坏主意表**：显式 pushback（过满日程、抵达日重排等 — 本仓已有部分 enforce，可写进 skill 提醒 Agent 别删）。

---

## 3. 对本仓的建议形态

### 3.1 推荐新建（开发 Agent）✅

**路径**：`.cursor/skills/travel-product-flow/SKILL.md` + `references/doc-anchors.md`

| 块 | 内容 |
|----|------|
| description 触发 | 改 generate / 机酒门禁 / 印证 / stay-zone / 玩法落地 / FLOW / HOT / evidence |
| 必读锚点 | [18](./18-机酒优先与迭代行程产品决策.md) · [34](./34-玩法印证与节点借鉴分析结论.md) · [36](./36-住宿搜索UX与换店困难分析.md) · [24](./24-GitHub旅行Agent调研与机酒玩法顺序讨论.md) |
| 硬规则 | 航班+锁店；印证按帖采纳；生成后可开住宿；Viator ❌；禁 Crew 壳修玩法 |
| 验收 | `planReadiness.test.ts` · credibility / lodging scripts |

可选第二 skill：`travel-evidence-borrow` — 仅印证部分借鉴深实施时再拆（暂缓）。

### 3.2 不建议

| 项 | 原因 |
|----|------|
| 原样安装 apljacob / Travel-Planning-Skill 为默认旅行大脑 | 与 Panel 机酒、HARD、策略三档冲突；运行时不生效 |
| 用 skill 塞全球 YAML「玩法 KB」当 B-SK 主交付 | 养不起；低于地图封闭池 |
| 一个 skill 塞满 00–34 全文 | 违背 create-skill：主文件宜短，细节链文档 |

### 3.3 与 TODO `B-SK-01/02` 的关系

| ID | 原意 | 建议调整认知 |
|----|------|----------------|
| B-SK-01 | travel-data-intelligence skill | ✅ **`travel-product-flow`**（开发向）；数据选型备忘可放 references |
| B-SK-02 | 境外 KB YAML | **降优先**；被「Places/围栏封闭池」替代后再谈策展卡 |

---

## 4. 效率预期（务实）

| 投入 | 预期收益 |
|------|----------|
| ✅ 1 个短 product-flow skill（+ 链到现有 docs） | 改玩法/印证/门禁时少漏 HARD、少提议 Crew 壳、少重复摸文件 |
| 照搬高星「旅行 Agent」或通用 planner skill | **低**；与产品契约打架，且不改善用户生成质量 |
| 封闭池工程（非 skill） | **对用户落地**增益最大（见 24/34） |

---

## 5. 参考链接

- https://github.com/618034128/Travel-Planning-Skill  
- https://github.com/apljacob/travel-agent  
- https://github.com/cuga-project/cuga-apps/blob/main/cuga-skills/travel_planner/SKILL.md  
- https://agentskill.sh/@samjale/travel-planner  
- https://github.com/VoltAgent/awesome-agent-skills  
- Cursor Skills：https://cursor.com/docs/skills  

---

*文档版本：v1.1 · 2026-08-11 · travel-product-flow ✅*
