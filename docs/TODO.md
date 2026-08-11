# 项目待办总索引

> **更新**：2026-08-11（**WS-EVID-REFS / must-nice** · ACT-POOL-ENFORCE · [34](./llm-travel-data/34-玩法印证与节点借鉴分析结论.md)）  
> **用途**：从各分析/方案文档汇总的 **开放待办**；实施完成后在本索引与子清单中勾选，并在源文档同步状态。  
> **原则**：每条待办必须有 **TODO ID** 与 **关联文档** 链接，便于后续 PR / 实施计划引用。

---

## 子清单（按域）

| 域 | 文件 | 范围 |
|----|------|------|
| **机酒 / LLM 数据 / 阶段 B** | [llm-travel-data/TODO.md](./llm-travel-data/TODO.md) | **SEC/DATA**、GEO、P3–P6、Chat Tool、**WX/WS/AG** |
| **布局 / 前端 UX** | [TODO-布局与前端.md](./TODO-布局与前端.md) | **对话编排 UX-CHAT-***、预览折叠、移动端 Phase 4 |
| **路线图 / 总览 / 导出** | [TODO-路线图与总览.md](./TODO-路线图与总览.md) | 总览抛光、导出主题、表单债务、`fetch_weather` UI |

**进度快照**：[开发进度.md](./开发进度.md) · **问题跟踪**：[问题日志.md](./问题日志.md)  
**能力缺口分析**：[15](./llm-travel-data/15-天气联网与决策Agent缺口分析.md) · **运行/偏离复核**：[20](./llm-travel-data/20-L1L2运行验证记录.md) · **GitHub Agent 调研**：[24](./llm-travel-data/24-GitHub旅行Agent调研与机酒玩法顺序讨论.md) · **能力借鉴与三档策略**：[25](./llm-travel-data/25-GitHub能力借鉴与规划策略三档分析.md) · **印证采纳**：[34](./llm-travel-data/34-玩法印证与节点借鉴分析结论.md) · **旅行 Skill**：[35](./llm-travel-data/35-旅行Skill与Agent效率分析.md) · **住宿换店 UX**：[36](./llm-travel-data/36-住宿搜索UX与换店困难分析.md) · **Trip 片区降级**：[26](./llm-travel-data/26-SerpAPI额度不足与Trip片区优先降级分析.md) · **API 缓存**：[27](./llm-travel-data/27-外部API缓存现状与优化分析.md) · **缓存/GEO 实施**：[28](./llm-travel-data/28-外部API缓存与GEO锚实施计划.md) ✅ · **RollingGo MCP**：[29](./llm-travel-data/29-RollingGo-MCP接入与Trip并存.md) · **P122**：[问题日志](./问题日志.md)

---

## 优先级摘要（开放项）

| 优先级 | ID 前缀 | 项 | 关联 |
|--------|---------|-----|------|
| **P0** | **`SEC-01b`** | 历史 blob / 账号轮换（**运维**） | [复检报告](./复检报告-travelAI-drag_dev2.md) |
| **P1** | `HOT-01` | 酒店源探路（**商务**） | [llm TODO](./llm-travel-data/TODO.md) |
| **P2** | `SEC-02` | 部署鉴权限流（部署前置） | [llm TODO](./llm-travel-data/TODO.md) |
| **扩张 / ⏸** | `WS-01/05` · `AG-*` · 移动端 · P5b · OV-03/04 · FM-* | 完整网页桶 / Agent / 天气 UI | [21](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) · [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
| **P2 扩张** | **`COST-02`** / **`COST-03`** | 餐饮价位 · 结构化 `cost`（~~`COST-01` Viator~~ ❌ 已取消） | [llm TODO §3c](./llm-travel-data/TODO.md) · [03](./llm-travel-data/03-游玩项目.md) |
| **P3/P4 债** | `OV-03/04` · `WX-03/04` | 故事条 / weather 对话 UI | [TODO-路线图](./TODO-路线图与总览.md) |

---

## 已完成（近期 · 仅索引）

| 域 | 里程碑 | 关联文档 |
|----|--------|----------|
| **OPS-01** | 独立 `/ops.html` API 用量看板（主壳零入口） | [llm TODO](./llm-travel-data/TODO.md) · [backend README](../backend/README.md) |
| **UX P67–P77** | 对话提示 · 地图门禁 · 航班缓存/空态 · Patch 审批策略 · 酒店两步选 · 印证可见 · 开销抽屉 | [问题日志](./问题日志.md) · [TODO-布局](./TODO-布局与前端.md) |
| **P88 / FLOW-01c** | 生成前锁定具体酒店 · 日闭环 hotel→POI→hotel · 默认三餐 · 换店重锚 | [问题日志 P88](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P90 / GEN-TOKEN** | generate `max_tokens` 8000 · 禁空 content→`{}` · 节点预算 4–6 · 单次修复 | [问题日志 P90](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P91** | generate 失败禁止 Mock 回退，露出真实错误 | [问题日志 P91](./问题日志.md) |
| **P92** | 明确返程日禁止当晚入住/过夜酒店 | [问题日志 P92](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P93** | generate 关 thinking · validate UI 非假完成 | [问题日志 P93](./问题日志.md) |
| **P97–P106** | 初锁店：不空开地图 · 生成 CTA 门禁 · lodging 空态 · 酒店钉/片区 fit · 离开住宿收图 · 圈钉绘制时序 | [问题日志](./问题日志.md) · [TODO-布局](./TODO-布局与前端.md) |
| **P113 / GEO-11** | 片区几何 / 店名搜索 geocode 优先 zone.city（防模糊目的地错圆心） | [问题日志 P113](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P117 / GEO-12** | 国家级 destination + 歧义城名：抵达机场 IATA 钉围栏 / 国家码 | [问题日志 P117](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P118 / HOT-02b** | 片区 lodging：EN query + 429 可感知（勿当无酒店） | [问题日志 P118](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P119 / HOT-02c** | 非枢纽城 reverse→EN；SSL 瞬时重试；有坐标禁中文 q | [问题日志 P119](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P120 / HOT-02d** | 片区 lodging localStorage 缓存（刷新复用、减 429） | [问题日志 P120](./问题日志.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **P114 / TRN-01** | 按需通勤查询（Directions + 提示词海路/山路兜底）· EdgeEditor | [问题日志 P114](./问题日志.md) · [04](./llm-travel-data/04-通勤与交通卡.md) |
| **P115 / TRN-02** | geocode 后可疑边自动补算 + Directions 缓存 | [问题日志 P115](./问题日志.md) · [04 §5.2](./llm-travel-data/04-通勤与交通卡.md) |
| **P116 / TRN-02b** | 通勤核实后按边时长重排当日节点时刻 | [问题日志 P116](./问题日志.md) · [04 §5.3](./llm-travel-data/04-通勤与交通卡.md) |
| **玩法可信度** | `WX-01` 预报注入 · POI hours · 雨日/通勤 warnings | [15](./llm-travel-data/15-天气联网与决策Agent缺口分析.md) |
| **WS-10 贴链** | 多链接模块 · `from-link` · generate `user_evidence` 优先 | [23](./llm-travel-data/23-玩法印证贴链MVP实施.md) · [19](./llm-travel-data/19-玩法印证与UGC数据源分析.md) |
| **Wave C + 可选增强** | `04/07` · FLT-CACHE · WS-08b · P6-02 · FLT-06 · GEN-01/02 · OV-01/02 | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) · [21](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) |
| **印证 P1** | `WS-CACHE` · `WS-08a/b` · `UX-EVD-01`（**保留 TikHub**；Reach 仅 bench） | [21 §0.1](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) |
| **Wave B** | 只读摘要卡 · 生成 checklist · 低风险自动写+Undo · 确认本批 | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
| **Wave A + WS-09** | Activity / 折叠例外 / evidence progress / 确认 CTA · Evidence query+过滤+bench · Tavily soft-merge | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) · [21](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) |
| **调研 22** | 对话编排 Wave A–C 已实施 | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
| **复查 P2** | SEC-03 CURRENT_ITINERARY · 指纹状态枚举 · SEC-04 单测 · 进度表矛盾 | [复查报告](./实施偏离与问题复查报告-travelAI-drag_dev2-2026-08-07.md) |
| **收尾波** | B-FLT-03/04/05/07 · GEO-09 · DATA-10 · HOT-02 · B-P6-01 | [llm TODO](./llm-travel-data/TODO.md) |
| **范围 2** | DATA-03～09 · FLOW-02 · HOT-03 · B-P4-04 · SEC-04 · FLT-LETSFG | [20 §6](./llm-travel-data/20-L1L2运行验证记录.md) |
| **UX-14 / B-FLT / B-P3** | 预览折叠 · Chat 搜航班 · 多航段 | [TODO-布局](./TODO-布局与前端.md) · [06](./llm-travel-data/06-机酒确认与行程生成流程方案.md) |
| **GEO-01～08 + SerpApi** | 围栏 + L1 主源 | [20](./llm-travel-data/20-L1L2运行验证记录.md) |

---

## 如何使用本索引

1. **新任务**：在对应域 `TODO.md` 追加一行，分配 ID，链到方案文档。  
2. **实施中**：PR / commit message 可写 `FLOW-02: optimize/regenerate modes`。  
3. **完成后**：子清单打 ✅，更新 [开发进度.md](./开发进度.md)；若源文档有 ⏳/`- [ ]`，同步改为 ✅。  
4. **暂停**：标 ⏸ 并写阻塞原因（如 API 未就绪）。

---

*索引版本：v1.21 · 2026-08-11（COST-01/Viator ❌ 取消）*
