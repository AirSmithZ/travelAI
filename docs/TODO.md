# 项目待办总索引

> **更新**：2026-07-05  
> **用途**：从各分析/方案文档汇总的 **开放待办**；实施完成后在本索引与子清单中勾选，并在源文档同步状态。  
> **原则**：每条待办必须有 **TODO ID** 与 **关联文档** 链接，便于后续 PR / 实施计划引用。

---

## 子清单（按域）

| 域 | 文件 | 范围 |
|----|------|------|
| **机酒 / LLM 数据 / 阶段 B** | [llm-travel-data/TODO.md](./llm-travel-data/TODO.md) | P3–P6、Chat Tool、Ignav/Trip、P5b |
| **布局 / 前端 UX** | [TODO-布局与前端.md](./TODO-布局与前端.md) | 预览区折叠、移动端 Phase 4 |
| **路线图 / 总览 / 导出** | [TODO-路线图与总览.md](./TODO-路线图与总览.md) | 总览抛光、导出主题、表单债务 |

**进度快照**：[开发进度.md](./开发进度.md) · **问题跟踪**：[问题日志.md](./问题日志.md)

---

## 优先级摘要（开放项）

| 优先级 | ID 前缀 | 项 | 关联 |
|--------|---------|-----|------|
| **P0** | `UX-14-*` | 无路线图时预览区折叠 | [14-方案](./14-无路线图时预览区折叠方案.md) |
| **P0** | `B-P4-*` | generate 读 `travel_intel` 硬约束 | [06 §7](./llm-travel-data/06-机酒确认与行程生成流程方案.md) · [09 §6](./llm-travel-data/09-阶段B航班功能实施计划.md) |
| **P1** | `B-P3-*` | 多航段 / 城际航班模板 | [06](./llm-travel-data/06-机酒确认与行程生成流程方案.md) |
| **P1** | `B-P4-*` | Chat Tool `search_flights` | [01-Trip.com §Phase2](./llm-travel-data/01-航班信息-Trip.com实施方案.md) · [Ignav报告](./llm-travel-data/01-航班信息-Ignav验证报告.md) |
| **P2** | `B-P3-*` | 航班手动添加增强（URL 预填、validate API） | [09 §6](./llm-travel-data/09-阶段B航班功能实施计划.md) · [08](./llm-travel-data/08-手动添加航班方案.md) |
| **P2** | `B-P6-*` | 多酒店 + 校验 | [06 §7](./llm-travel-data/06-机酒确认与行程生成流程方案.md) |
| **P2** | `UX-M4-*` | 移动端响应式 + 触摸 | [项目分析 §Phase4](./项目分析与设计文档.md) |
| **P3** | `OV-*` | 总览 ResizeObserver / 导出主题 | [总览路线图实现分析](./总览路线图实现分析.md) |
| **⏸** | `B-P5b-*` | OTA 酒店 ranked 搜价 | [13 §1#14](./llm-travel-data/13-阶段B住宿区域实施计划.md) · [11 对称分析](./llm-travel-data/11-阶段B酒店对称方案分析.md) |
| **⏸** | `B-R-*` | Duffel Sandbox / 境内旅行 | [Spike报告](./llm-travel-data/01-航班信息-Spike验证报告.md) |

---

## 已完成（近期 · 仅索引，细节见源文档）

| 域 | 里程碑 | 关联文档 |
|----|--------|----------|
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

*索引版本：v1.0 · 2026-07-05*
