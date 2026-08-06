# 项目待办总索引

> **更新**：2026-08-07  
> **用途**：从各分析/方案文档汇总的 **开放待办**；实施完成后在本索引与子清单中勾选，并在源文档同步状态。  
> **原则**：每条待办必须有 **TODO ID** 与 **关联文档** 链接，便于后续 PR / 实施计划引用。

---

## 子清单（按域）

| 域 | 文件 | 范围 |
|----|------|------|
| **机酒 / LLM 数据 / 阶段 B** | [llm-travel-data/TODO.md](./llm-travel-data/TODO.md) | **SEC/DATA**、GEO、P3–P6、Chat Tool、**WX/WS/AG** |
| **布局 / 前端 UX** | [TODO-布局与前端.md](./TODO-布局与前端.md) | 预览区折叠、移动端 Phase 4 |
| **路线图 / 总览 / 导出** | [TODO-路线图与总览.md](./TODO-路线图与总览.md) | 总览抛光、导出主题、表单债务、`fetch_weather` UI |

**进度快照**：[开发进度.md](./开发进度.md) · **问题跟踪**：[问题日志.md](./问题日志.md)  
**能力缺口分析**：[15](./llm-travel-data/15-天气联网与决策Agent缺口分析.md) · **审查对照**：[分析报告-drag_dev](./分析报告-travelAI-drag_dev.md)

---

## 优先级摘要（开放项）

> **纠偏**：Wave 1–2（GEO 围栏、B-P4 机酒锚点）已在工作区落地 ✅。当前主线见子清单建议顺序；天气/Tavily 仍 ⏸。

| 优先级 | ID 前缀 | 项 | 关联 |
|--------|---------|-----|------|
| **P0** | ~~`SEC-01`~~ ✅ | Chrome 档案已出库（gitignore + untrack）；远端历史若曾 push 需轮换账号 | [llm TODO §0](./llm-travel-data/TODO.md) |
| **P0** | ~~`DATA-01`~~ ✅ | 行程日期用 `date_start` | [llm TODO §0c](./llm-travel-data/TODO.md) |
| **P1** | `DATA-02`–`06` | timezone 完整表、Mock 合一、Pydantic、LLM schema、compact/FormPatch | [llm TODO §0c](./llm-travel-data/TODO.md) |
| **P1** | ~~`FLOW-01b`~~ ✅ | 后端 generate 无航班拒绝 | `itineraries.py` |
| **P1** | `HOT-*` / `GEO-03/05` | 酒店源探路 + geocode 英译/debounce | [17](./llm-travel-data/17-用户决策回应与Geocode机酒重排.md) |
| **P1** | `UX-14-*` | 无路线图时预览区折叠（主诉已解后可做） | [14-方案](./14-无路线图时预览区折叠方案.md) |
| **P2** / **⏸** | `WX-*` / 多数 `WS-*` / `SEC-02` | 天气/Tavily 暂缓；公网鉴权部署前再做 | [17 §4](./llm-travel-data/17-用户决策回应与Geocode机酒重排.md) |

---

## 已完成（近期 · 仅索引，细节见源文档）

| 域 | 里程碑 | 关联文档 |
|----|--------|----------|
| **GEO-01/02/04** | 目的地围栏 + 超时/warnings；`app/data` 已跟踪 | [llm TODO](./llm-travel-data/TODO.md) · [17](./llm-travel-data/17-用户决策回应与Geocode机酒重排.md) |
| **B-P4-01/02/03 · FLOW-01 · AG-01** | generate 吃 travel_intel；前端无航班阻断 | [06](./llm-travel-data/06-机酒确认与行程生成流程方案.md) · [18](./llm-travel-data/18-机酒优先与迭代行程产品决策.md) |
| **FLT-RANK-01** | balanced 5:2:2:1 权重 | `rank.py` |
| 航班 P1–P2c | Ignav + Panel + 手动添加 | [09](./llm-travel-data/09-阶段B航班功能实施计划.md) |
| 航班 P3-UX | `leftPanelMode: flight` 全高 | [10](./llm-travel-data/10-阶段B航班UX问题分析.md) |
| 住宿 P5z | 片区倒推 + 地图 + hotel 节点 | [13](./llm-travel-data/13-阶段B住宿区域实施计划.md) · [12](./llm-travel-data/12-阶段B住宿区域倒推方案.md) |
| Phase 3s–3u | 导出 PDF、总览虚拟化、update_edge | [开发进度](./开发进度.md) |

---

## 如何使用本索引

1. **新任务**：在对应域 `TODO.md` 追加一行，分配 ID，链到方案文档。  
2. **实施中**：PR / commit message 可写 `UX-14-01: collapse preview when no itinerary`。  
3. **完成后**：子清单打 ✅，更新 [开发进度.md](./开发进度.md)；若源文档有 ⏳/`- [ ]`，同步改为 ✅。  
4. **暂停**：标 ⏸ 并写阻塞原因（如 API 未就绪）。

---

## 文档 ↔ TODO 反向链接约定

源文档文末或相关章节应保留：

```markdown
> **待办追踪**：[docs/TODO.md](./TODO.md) · 本主题见 [llm-travel-data/TODO.md](./llm-travel-data/TODO.md) `B-P4-01`
```

本仓库已在以下文档加入追踪链接（2026-07-05）：

- [开发进度.md](./开发进度.md)
- [14-无路线图时预览区折叠方案.md](./14-无路线图时预览区折叠方案.md)
- [llm-travel-data/README.md](./llm-travel-data/README.md)
- [06 / 09 / 12 / 13](./llm-travel-data/06-机酒确认与行程生成流程方案.md)（阶段 B 主链）

---

*索引版本：v1.3 · 2026-08-07 · Wave 1–2 完成后按 [分析报告](./分析报告-travelAI-drag_dev.md) 补录 SEC/DATA*
