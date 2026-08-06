# travelAI `drag_dev2` 分支复检报告

> 对照上一份《分析报告-travelAI-drag_dev.md》（针对 `drag_dev` 分支）的整改结论，验证已声称修复的问题是否真修好，并扫描是否还有遗漏/新问题。  
> 复检方式：克隆 `drag_dev2` 分支 → 交叉核对 `docs/` TODO 与 `backend/`、`frontend/`、`flight-spike/` 实际代码 → 跑通 GEO 围栏单测。  
> 复检时间：2026-08-07  
> **处置状态**：同日已核验属实项并修复（见 §5）；运行结论见 [20-L1L2运行验证记录](./llm-travel-data/20-L1L2运行验证记录.md)。

---

## 0. 一句话结论

**上一轮的核心修复（GEO 围栏、机酒硬约束注入、后端航班门禁、日期契约、深链去自动打开）都真实落地了，且 GEO 围栏单测通过。** 但复检时发现 **P0「SEC-01」曾被误标 ✅**：根目录档案已出库，**`backend/` 与 `flight-spike/` 下两份 Chrome 档案仍被 git 跟踪**（约 390 文件，含 Cookies）。该问题及围栏中心失败边缘路径 **已在同日处置提交中修复**；远端历史 blob 若曾含凭证，仍需账号轮换 / 可选历史清洗。

---

## 1. 已确认修复（真修好了，有证据）

| 原问题 | 结论 | 证据 |
|--------|------|------|
| **GEO-01/02** 生成路径盲信 Top1、无围栏→地图错点 | ✅ 已修且单测通过 | `geocode_providers.py` `filter_hits_by_fence` + bias；`test_geocode_fence.py` 全绿 |
| **B-P4** generate 不读机酒锚点 | ✅ 已修 | `_format_travel_intel_block` HARD CONSTRAINTS；HTTP 实测 Day1 服从 16:30 抵达 |
| **FLOW-01b** 后端无航班也能生成 | ✅ 已修 | `_require_confirmed_flights` → 400；HTTP 实测 |
| **DATA-01** `date.today()` | ✅ 已修 | `_parse_trip_start_date` + `test_itinerary_dates.py` |
| **深链自动打开** | ✅ 已修 | 无 `window.open()`；`<a target="_blank" rel="noopener noreferrer">` |
| **WS-04/07** 玩法印证 | ✅ 已修（TikHub 402 时降级空 pack） | `ugc/` + generate 注入 |
| **LLM 静默 mock** | ✅ 已修 | 有 client 时校验失败 `raise` |
| `.env` 密钥 | ✅ 干净 | 仅环境变量 |

---

## 2. 复检时仍存在的问题 → 处置

### 🔴 P0 — SEC-01 假修复（**属实 · 已修索引**）

| 项 | 复检事实 | 处置（2026-08-07） |
|----|----------|-------------------|
| 跟踪路径 | `backend/.edreams_chrome_data/**`、`flight-spike/.edreams_chrome_data/**` 仍在 `git ls-files`（约 390） | ✅ `git rm -r --cached` 两路径；当前 index **0** 跟踪 |
| gitignore | 根规则有；`flight-spike/.gitignore` 无 | ✅ 根加强 `**/.edreams_chrome_data/`；spike 补规则 |
| TODO 谎报 ✅ | 属实 | ✅ 文档改为：索引已清；**历史 blob / 账号轮换仍提醒** |
| 运维 | 若曾 push | 🔲 轮换 eDreams/Trip.com；可选 `git filter-repo`（见 SEC-01b） |

### 🟠 P1 — 中心解析失败时围栏失效（**属实 · 已修**）

- 原：`fence_km=None` + `allow_bare_without_fence=True` → 放开裸名 Top1。  
- 现：有目的地时禁止裸名全球 Top1；保留 `countrycodes` 过滤异国命中；无距离围栏时 `coord_confidence=low`。单测：`country-only filter OK`。

### 🟠 P1 — 围栏内「近但错」（**属实 · 部分缓解**）

- 现：`geocode_place` / `_apply_geocode_to_node` 取 top5 + `_name_relevance` 选名。非完整语义排序，但优于盲信第 1 条。

### 🟡 P2 — 信心降级不一致（**属实 · 已修**）

- 统一：成功命中默认 `medium`；仅「有 destination 但无距离围栏」时标 `low`。

### 仍开放（计划内债）

| ID | 说明 |
|----|------|
| DATA-02～06 | 完整时区表、Mock 合一、Pydantic 出参、schema/FormPatch |
| SEC-02 | 公网鉴权/限速 |
| WX-* | 天气 stub（产品 ⏸） |
| flight-spike 双源 | 维护债，非本轮必修 |

---

## 3. 复检后优先行动清单（更新）

1. ~~SEC-01 出库 nested Chrome~~ ✅ 索引；**SEC-01b** 账号轮换 / 历史清洗 🔲  
2. ~~中心失败 countrycodes + 禁裸名~~ ✅  
3. ~~名称相关性 + 信心统一~~ ✅（轻量）  
4. DATA-02/03/04/06 契约收敛 🔲  
5. SEC-02 上线前 🔲；flight-spike 归档策略 🔲  

---

## 4. 与上轮结论的对照小结

- 上轮点名的 GEO / B-P4 / FLOW-01b / 深链：**真修好**。  
- SEC-01：**曾只清根目录、误标完成**；nested 两份属实，**现已清出 index**。  
- 数据契约与天气：计划内未清，非回归。

---

## 5. 本轮核验方法

- `git ls-files \| rg edreams_chrome` → 复检时 390 → 修复后 0  
- `PYTHONPATH=. python scripts/test_geocode_fence.py`（含 country-only / name relevance）  
- HTTP 运行记录：[20-L1L2运行验证记录.md](./llm-travel-data/20-L1L2运行验证记录.md)  
- Security skill：`review-security` 子代理确认 nested 档案仍在磁盘且 TODO 曾谎报  

---

*报告版本：v1.1 · 2026-08-07 · 含处置回写*
