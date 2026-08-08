# 项目待办总索引

> **更新**：2026-08-08（[21 §0.1](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) 成本决策：保留 TikHub；Wave A/B 已落地）  
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
**能力缺口分析**：[15](./llm-travel-data/15-天气联网与决策Agent缺口分析.md) · **运行/偏离复核**：[20](./llm-travel-data/20-L1L2运行验证记录.md)

---

## 优先级摘要（开放项）

| 优先级 | ID 前缀 | 项 | 关联 |
|--------|---------|-----|------|
| **P0** | **`SEC-01b`** | 历史 blob / 账号轮换（**运维**） | [复检报告](./复检报告-travelAI-drag_dev2.md) |
| **P1** | `HOT-01` | 酒店源探路（**商务**） | [llm TODO](./llm-travel-data/TODO.md) |
| **P2** | `SEC-02` · `B-P6-02` · `B-FLT-06` | 部署鉴权；总览换店；机场标签同步 | [llm TODO](./llm-travel-data/TODO.md) |
| **P2 UX（Wave C）** | `UX-CHAT-04/07` · `UX-FLT-CACHE` | 左栏收敛 · reasoning · 航班缓存 | [22 §6](./llm-travel-data/22-对话编排与玩法印证UX调研.md) · [TODO-布局](./TODO-布局与前端.md) |
| **扩张 / ⏸** | `WS-08b` · `WS-01/05` · `AG-*` · 移动端 · P5b | Places 重型 / Reach 不进生产 | [21](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) · [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
| **P3 UI 债** | `UX-GEN-*` · `OV-*` | Marker 聚类 / 骨架 / 总览抛光 | [TODO-布局](./TODO-布局与前端.md) · [TODO-路线图](./TODO-路线图与总览.md) |

---

## 已完成（近期 · 仅索引）

| 域 | 里程碑 | 关联文档 |
|----|--------|----------|
| **印证 P1** | `WS-CACHE` · `WS-08a` · `UX-EVD-01`（**保留 TikHub**；Reach 仅 bench） | [21 §0.1](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) |
| **Wave B** | 只读摘要卡 · 生成 checklist · 低风险自动写+Undo · 确认本批 | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
| **Wave A + WS-09** | Activity / 折叠例外 / evidence progress / 确认 CTA · Evidence query+过滤+bench · Tavily soft-merge | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) · [21](./llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md) |
| **调研 22** | 对话编排（Wave C 仍开放） | [22](./llm-travel-data/22-对话编排与玩法印证UX调研.md) |
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

*索引版本：v1.10 · 2026-08-08（TikHub 保留 + WS-CACHE/08a）*
