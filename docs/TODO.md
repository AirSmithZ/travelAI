# 项目待办总索引

> **更新**：2026-08-07（B-P3-01/02 · 移动端⏸）  
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
**能力缺口分析**：[15](./llm-travel-data/15-天气联网与决策Agent缺口分析.md) · **运行/偏离复核**：[20](./llm-travel-data/20-L1L2运行验证记录.md)

---

## 优先级摘要（开放项）

| 优先级 | ID 前缀 | 项 | 关联 |
|--------|---------|-----|------|
| **P0** | **`SEC-01b`** | 历史 blob / 账号轮换（运维） | [复检报告](./复检报告-travelAI-drag_dev2.md) |
| **P1** | `HOT-01` | 酒店源探路（商务，非代码） | [llm TODO](./llm-travel-data/TODO.md) |
| **P2** | `SEC-02` · `HOT-02` · `GEO-09` · `DATA-10` · `B-FLT-03/04` | 公网鉴权；Places；和风；POI；手动航班 | [llm TODO](./llm-travel-data/TODO.md) |
| **P2** / **⏸** | `UX-14-07` / `UX-M4-*` · `WX-*` | **移动端暂缓** · 天气/Tavily 暂缓 | [TODO-布局](./TODO-布局与前端.md) · [16](./llm-travel-data/16-产品能力优先级纠偏分析.md) |

---

## 已完成（近期 · 仅索引）

| 域 | 里程碑 | 关联文档 |
|----|--------|----------|
| **范围 2** | DATA-03～09 · FLOW-02 · HOT-03 · B-P4-04 · SEC-04 · FLT-LETSFG | [20 §6](./llm-travel-data/20-L1L2运行验证记录.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **UX-14 / B-FLT** | 无行程预览折叠 · Chat `search_flights` → Ignav | [TODO-布局](./TODO-布局与前端.md) · [llm TODO](./llm-travel-data/TODO.md) |
| **B-P3** | 多航段 UI（往返/多城/城际模板 + sequence） | [06](./llm-travel-data/06-机酒确认与行程生成流程方案.md) |
| **GEO-01～08 + SerpApi** | 围栏 + L1 主源 | [20](./llm-travel-data/20-L1L2运行验证记录.md) |
| **SEC-03 / B-P4 / FLT-RANK / WS-04/06** | 注入隔离 · 机酒锚点 · 参考价 · Evidence 侧栏 | [残留报告](./残留漏洞分析报告-travelAI-drag_dev2-2026-08-07.md) |
| 住宿 P5z · Phase 3s–3u | 片区倒推 · 导出/虚拟化 | [13](./llm-travel-data/13-阶段B住宿区域实施计划.md) |

---

## 如何使用本索引

1. **新任务**：在对应域 `TODO.md` 追加一行，分配 ID，链到方案文档。  
2. **实施中**：PR / commit message 可写 `FLOW-02: optimize/regenerate modes`。  
3. **完成后**：子清单打 ✅，更新 [开发进度.md](./开发进度.md)；若源文档有 ⏳/`- [ ]`，同步改为 ✅。  
4. **暂停**：标 ⏸ 并写阻塞原因（如 API 未就绪）。

---

*索引版本：v1.6 · 2026-08-07*
