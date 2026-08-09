# travelAI · 现存问题复查报告（第八轮 / Round 8）
分支：`drag_dev2` @ HEAD `4e87221` ｜ 时间：2026-08-06

> 本轮回溯以**分支 HEAD 的远端原始文件**为准（前几轮部分结论基于本地过时克隆 `2cf2650`，已在本轮逐项纠正）。
> 结论方法：git trees?recursive=1 取全量文件清单 → raw 文件逐容器追溯挂载 → 后端/前端数据契约比对。

---

## 〇、先纠正前三轮的两条错误结论（重要）

本轮在 HEAD 重新核实，发现我之前基于**落后本地克隆**给出过两条错误判断，先予以纠正：

| 此前（错误）结论 | HEAD 实际 | 证据 |
|---|---|---|
| R7：EvidencePanel 是**死代码**（无挂载点） | **已挂载**。在 `InputPanel.tsx` 中以 `leftPanelMode==='evidence'` 模式渲染，并有「参考依据」入口按钮 | `frontend/src/components/input/InputPanel.tsx` 第 13 行 import、第 ~95 行 `<EvidencePanel items={evidenceItems} …/>` |
| R4/R8：前端从不传 `mode`/`current_itinerary`（FLOW-02 死代码） | **API 与 store 已完整支持** `mode` 与 `current_itinerary` 透传 | `frontend/src/api/itinerary.ts`（GenerateMode='generate'\|'optimize'\|'regenerate'）、`usePlanStore.ts` 调用 `generateItineraryStream(…, { mode, current_itinerary: mode∈{optimize,regenerate}?p.itinerary:null })` |
| R8：WS-08 `poi_extract/filter_evidence/places_enrich` 已实现并接线、写 `meta.poi_candidates`/`verified` | **`enrich_evidence_pois` 不存在于 `itinerary_llm.py`；`ugc/places_enrich.py` 404；`meta` 无 `poi_candidates`/`verified`** | WebFetch `itinerary_llm.py` 全文无 `enrich_evidence_pois`/`poi_candidates`/`verified`；`places_enrich.py` 返回 404 |

**教训（已写入工作区记忆）**：对「文件是否存在 / 组件是否挂载 / 接线是否完成」下结论前，必须基于分支 HEAD 的远端清单与渲染树逐容器核实，不能依赖本地克隆。

---

## 一、仍然存在的问题（HEAD 核实）

### 🔴 P1 — 文档与代码严重偏离：把"规划中"写成"已具备"（印证校验能力）
来源文档：`docs/llm-travel-data/21-Agent-Reach与玩法印证多源实施调研.md`、`22-对话编排与玩法印证UX调研.md`。

文档描述的"玩法印证 / 参考依据"能力，与 HEAD 代码实际实现的差距：

| 文档宣称 | HEAD 代码实际 | 结论 |
|---|---|---|
| 「每条真实 URL」「已核验标记」「POI 候选匹配」 | `EvidencePanel` 仅渲染 `title / url / snippet / source / likes`，**无 `verified`、无 `poi_candidates`、无逐活动校验标记** | ❌ 未实现 |
| WS-08 `enrich_evidence_pois` 产出 `verified`/`poi_candidates` 并写入 `meta` | 该函数不存在；`meta["evidence"]` 只是 `fetch_evidence_pack` 的原文链接列表（`{title,url,snippet,source,likes?,query?}`） | ❌ 未实现 |
| 「侧栏已具备」「组件已建待挂载」 | 组件**确实已建且已挂载**（`InputPanel` evidence 模式） | ✅ 这部分文档是对的；我 R7 判错 |

**风险**：评审/管理层会以为"已对每条笔记做了 POI 校验、能逐活动标注可信度"，实际用户看到的只是一份**未经校验的公开笔记链接清单 + 一句'自行打开核对'免责声明**。信任信号缺失，且文档承诺了代码未交付的能力。

### 🟠 P2 — 证据功能在无 TikHub 配置时"静默消失"，无任何提示
`backend/app/services/ugc/evidence_pack.py`：
```python
async def fetch_evidence_pack(...):
    if not cfg.tikhub_configured:
        return []          # 未配置 → 空
    ...
```
- 返回 `[]` → `_attach_evidence_meta` 不写 `meta.evidence` → 前端 `evidenceCount===0`。
- 前端 `InputPanel.tsx` 中「参考依据」按钮与「参考依据 (count)」入口**均以 `evidenceCount>0` 为前置条件** → 整个印证 UI 在默认/本地部署下**完全不可见**，且无"未配置数据源"之类的任何提示。
- 优点：失败路径被 `try/except` 包住返回 `[]`，**不会 500**（韧性 OK）。
- 缺点：**可发现性为零**。默认部署看起来像"功能坏了/没做"，而不是"未配置"。

### 🟠 P2 — FLOW-02（optimize / regenerate）后端路径已接通但 UI 永不触发
- `api/itinerary.ts`、`usePlanStore.ts` 已正确透传 `mode` 与 `current_itinerary`（前几轮报的"死代码"已修正）。
- 但 store 内**所有调用方**（`maybeAutoGenerateItinerary`、`confirmPatches`）都走默认 `mode:'generate'`，`current_itinerary` 恒为 `null`。
- `ChatPanel.tsx` **完全不调用** `generateItinerary`，只做 `parseChatMessage`（→ patch）与 `executeChatToolCalls`（航班）。
- 因此：后端 `generate_itinerary_async` 中 `mode=='optimize'/'regenerate'` 分支**虽已写好但从未被前端触发**，属于"已接通、未启用"的隐形死路径。用户没有入口去"优化/重生成"当前行程。

### 🟡 P3 — 数据契约微缺口（不影响渲染，建议对齐）
- 前端 `ItineraryEvidenceItem` 声明了 `note_id?`，但后端 `evidence_items_as_dicts` 是否产 `note_id` 未核实；`EvidencePanel` 用 `note_id||url||title` 作 React key，**缺失时回退，无渲染错误**，但建议后端明确补充 `note_id` 以保证列表 key 稳定。

---

## 二、前几轮报的 P0 问题 — 本轮确认状态

| 问题 | 状态 | 说明 |
|---|---|---|
| SEC-01 提交含 Cookie 的 Chrome 档案 | ✅ 已修复 | 远端已 `git rm` 删除档案；`.gitignore` 已加 |
| GEO-01 geocode 盲信 Top1 / 围栏 | ✅ 已加固 | `filter_hits_by_fence`、`_bias_for_destination`、`_name_relevance` 存在 |
| B-P4 generate 不读机酒硬约束 | ✅ 已修复 | `travel_intel` 注入 system HARD CONSTRAINTS；API 透传 `travel_intel` |
| 提示注入（itinerary_llm 拼接） | ✅ 已修复 | HARD CONSTRAINTS 系统提示优先 + USER_DATA/UGC 标不可信 |
| letsfg 外部 CLI 合规风险 | ✅ 默认关闭 | `include_letsfg:false`（executeChatToolCalls）/ 默认 off |

> 上述 P0 均为 HEAD 核实，本轮无新增阻断性漏洞。

---

## 三、给项目的建议（按优先级）

1. **（P1）统一文档口径**：在 doc21/22 中明确标注 WS-08「POI 校验 / 已核验标记 / poi_candidates」为 **TODO/规划中**，而非"已具备"；或把当前已交付的"原始链接清单"如实描述，避免承诺未实现能力。
2. **（P2）证据功能可发现性**：`fetch_evidence_pack` 未配置/为空时，前端应显示「未配置公开笔记数据源 / 本次无印证链接」的占位与说明，而不是让入口按钮直接消失。
3. **（P2）FLOW-02 启用**：要么在 UI 上增加「优化本行程 / 基于当前重生成」入口（调用 `generateItinerary('optimize'|'regenerate')`），要么在文档中将其标注为"预留能力未开放"，避免后端死路径长期无人触发、退化失真。
4. **（P3）契约对齐**：后端补充 `note_id` 字段，确保 `EvidencePanel` 列表 key 稳定。

---

## 四、本轮核实文件清单（均取自 HEAD `4e87221` raw）
- `frontend/src/App.tsx`、`components/AppShell.tsx`、`components/input/InputPanel.tsx`、`components/preview/PreviewPane.tsx`、`components/tabs/ViewTabs.tsx`
- `frontend/src/components/evidence/EvidencePanel.tsx`、`frontend/src/types/itinerary.ts`、`frontend/src/api/itinerary.ts`
- `frontend/src/stores/usePlanStore.ts`、`frontend/src/components/chat/ChatPanel.tsx`、`frontend/src/components/chat/executeChatToolCalls.ts`
- `backend/app/services/itinerary_llm.py`、`backend/app/services/ugc/evidence_pack.py`
- `backend/app/services/ugc/places_enrich.py`（404，确认不存在）

---

## 五、2026-08-08 对照当前工作树复核

> 相对报告基准 `4e87221` → 当前分支已前进。下列为逐项核实，**勿再按 §一 原文排期**。

| 原条目 | 报告当时 (`4e87221`) | 当前工作树 | 处置 |
|--------|----------------------|------------|------|
| §〇 EvidencePanel 已挂载 | ✅ | ✅ | 维持 |
| §〇 mode 透传 | ✅ | ✅ | 维持 |
| §〇 WS-08 未接线 | ✅ 当时属实 | ❌ 已过时（`WS-08a/b`、`enrich_evidence_pois`、`verified`/`poi_candidates`） | 勿再开任务 |
| 🔴 P1 无核验 UI / POI | ✅ 代码缺口属实；文档「已具备」指控偏重 | ❌ 已过时（`UX-EVD-01`） | 关闭 |
| 🟠 P2 无 Key 入口消失 | ✅ | ✅ **已修**（见下） | **UX-EVD-02** |
| 🟠 P2 FLOW-02 永不触发 | ❌ **误判**（当时已有 `IntelDirtyBanner`） | ❌ 不成立 | 关闭 |
| 🟡 P3 `note_id` | ❌ 当时已由 TikHub normalize 产出 | ❌ 不成立 | 关闭 |

### UX-EVD-02（本轮落地）— 印证可发现性

- 后端：`meta.evidence_status` = `ok` | `empty` | `unconfigured`（空包也写入；warning 说明未配置 Key）
- 前端：行程生成后「参考依据」入口**始终可见**；空态区分未配置 / 无结果
- 摘要卡：`open_evidence` 在有行程时可用，detail 反映 status

验收：未配 `TIKHUB_API_KEY`/`TAVILY_API_KEY` 时生成行程 → 仍见「参考依据」条 → 面板文案提示配置 Key。
