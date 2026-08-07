# 机酒 / LLM 数据 — 待办清单

← [总索引](../TODO.md) · [README](./README.md) · [06-机酒流程](./06-机酒确认与行程生成流程方案.md)

> **更新**：2026-08-07（B-P3-01/02 多航段 UI · 移动端任务⏸）  
> **ID 前缀**：`SEC-` / `DATA-` / `B-` / `GEO-` / `WX-` / `WS-` / `AG-` · 状态：🔲 开放 · ⏸ 暂停 · ✅ 完成 · 🔧 进行中

---

## 0. 安全 / 合规 `SEC-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **SEC-01** | ✅ | **P0** | 三处 Chrome 档案出 index；gitignore `**/.edreams_chrome_data/` | [复检报告](../复检报告-travelAI-drag_dev2.md) |
| **SEC-01b** | 🔲 | **P0** | 若曾 push：轮换 eDreams/Trip.com 账号；可选 filter-repo | [复检报告 §2](../复检报告-travelAI-drag_dev2.md) |
| **SEC-02** | 🔲 | P2 | 公网部署前：generate 鉴权或限速；收紧 CORS | [残留报告](../残留漏洞分析报告-travelAI-drag_dev2-2026-08-07.md) |
| **SEC-03** | ✅ | **P1** | 提示注入隔离 HARD / USER_DATA / UNTRUSTED_UGC | `itinerary_llm.py` |
| **SEC-04** | ✅ | P3 | 外部 base_url：`https` + 主机 allowlist（启动校验） | `config.py` · [backend README](../../backend/README.md) |
| **FLT-LETSFG** | ✅ | P2 | 默认关闭；主源 Ignav；合规/spike 边界已文档化 | `.env.example` · [backend README](../../backend/README.md) |
| **GEO-06/07/08** | ✅ | — | 围栏降级 / 名称相关 / 距离融合 | [复检/残留报告](../复检报告-travelAI-drag_dev2.md) |

---

## 0b. 地理编码 `GEO-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **GEO-01/02/04** | ✅ | P0 | 围栏 / warnings / data 跟踪 | [17](./17-用户决策回应与Geocode机酒重排.md) |
| **GEO-03** | ✅ | P1 | SerpApi Google Maps 主源 | [20 §5](./20-L1L2运行验证记录.md) |
| **GEO-05** | ✅ | P1 | NodeCoordEditor 400ms debounce | `NodeCoordEditor.tsx` |
| **GEO-09** | 🔲 | P2 | 和风城市中心 / 中文名英译变体 | [17 §3.3](./17-用户决策回应与Geocode机酒重排.md) |

### 酒店 / 流程 / 排序

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **HOT-01** | 🔲 | P1 | 验证 Hotelbeds / Trip Partner 是否可申请沙箱 | [17 §2](./17-用户决策回应与Geocode机酒重排.md) |
| **HOT-02** | 🔲 | P2 | 片区内 lodging（Places）+ 深链价 | [17 §2.3](./17-用户决策回应与Geocode机酒重排.md) |
| **HOT-03** | ✅ | P1 | 每晚预算字段/UI；Trip 深链 `highPrice`；prompt 软约束 | [18](./18-机酒优先与迭代行程产品决策.md) · StayZonePanel |
| **FLT-RANK-01/02** | ✅ | — | 5:2:2:1 + 参考价文案 | `rank.py` · FlightIntelPanel |
| **FLOW-01/01b** | ✅ | — | 无航班阻断前后端 | [18](./18-机酒优先与迭代行程产品决策.md) |
| **FLOW-02** | ✅ | P1 | `optimize` / `regenerate` + dirty banner（不自动重跑） | [18 §4](./18-机酒优先与迭代行程产品决策.md) · [20 §6](./20-L1L2运行验证记录.md) |

---

## 0c. 生成数据契约 `DATA-*`

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **DATA-01** | ✅ | P0 | `date_start` → `days[].date` | `test_itinerary_dates.py` |
| **DATA-02** | ✅ | P1 | `timezones.py` 国家码+关键词 | `test_itinerary_dates.py` |
| **DATA-03** | ✅ | P1 | 单源 `mock_singapore.json`；日期连续 10-16…19 | FE import 同文件 |
| **DATA-04** | ✅ | P1 | generate/geocode 出参 `validate_itinerary_dict` | `schemas/itinerary.py` |
| **DATA-05** | ✅ | P1 | LLM `tags` / `scene_group` / 可选 edges | `itinerary_llm.py` |
| **DATA-06** | ✅ | P1 | compact + FormPatch 白名单加厚 | compactItineraryForParse · form_patch_tool |
| **DATA-07** | ✅ | P2 | region 别名归一（市中心/CBD…） | `region_aliases.py` |
| **DATA-08** | ✅ | P2 | 文档：键名 `travel_plans_v1` vs `STORAGE_VERSION=3`（非 bug） | 见下 DATA-08 注 · storage.ts |
| **DATA-09** | ✅ | P2 | tips「未联网核实」标注 | TipsEditor |
| **DATA-10** | 🔲 | P3 | 可选 `place_id` / 跨天 POI 去重 | [前端数据格式 §6.11](../前端数据格式与Mock对照分析.md) |

> **DATA-08 注**：`localStorage` **键**仍为历史名 `travel_plans_v1`；payload 内 `version` 为 `STORAGE_VERSION=3`。改键名会丢用户本地计划，故保留键名、以 version 字段演进。

---

## 1. 阶段 B 主链路（P3–P6）

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **B-P3-01** | ✅ | P1 | 多航段航班 UI：sequence 列表、往返/多城/城际模板、「添加下一段」 | [06 §7 P3](./06-机酒确认与行程生成流程方案.md) · FlightIntelPanel |
| **B-P3-02** | ✅ | P2 | 城际航段快捷入口（模板芯片预填 OD） | [06 §7 P3](./06-机酒确认与行程生成流程方案.md) |
| **B-P4-01/02/03** | ✅ | P0 | intel 硬约束 / 片区 / 无航班门禁 | [18](./18-机酒优先与迭代行程产品决策.md) |
| **B-P4-04** | ✅ | P1 | meta `flight_quote_ids` + `intel_snapshot` | `intel_fingerprint.py` |
| **B-P6-01/02** | 🔲 | P2 | 多酒店换店规则 | [06 §7 P6](./06-机酒确认与行程生成流程方案.md) |

---

## 2. 航班 — Chat / Tool / 增强

| ID | 状态 | 优先级 | 待办 | 关联文档 |
|----|------|--------|------|----------|
| **B-FLT-01** | ✅ | P1 | Chat Tool `search_flights` → Ignav（parse 出 tool_calls；前端执行 `/flights/search`） | [01-Trip.com](./01-航班信息-Trip.com实施方案.md) |
| **B-FLT-02** | ✅ | P1 | Prompt 禁编票价 + Tool 来源标签（warnings / session） | [01-Trip.com](./01-航班信息-Trip.com实施方案.md) |
| **B-FLT-03** | 🔲 | P2 | `parseTripcomSearchUrl` 预填手动表单 | [09](./09-阶段B航班功能实施计划.md) |
| **B-FLT-04** | 🔲 | P2 | `POST /flights/manual-validate` | [08](./08-手动添加航班方案.md) |
| **B-FLT-05/06/07** | 🔲 | P3 | 中文航线列 / sync-airport-labels / 深链 QA | [09](./09-阶段B航班功能实施计划.md) |
| **B-FLT-08** | ⏸ | — | flight-verify 合并或废弃 | [06](./06-机酒确认与行程生成流程方案.md) |

---

## 3. 住宿 P5b ⏸ / P5z ✅

| ID | 状态 | 项 |
|----|------|-----|
| B-P5b-* | ⏸ | OTA 对称搜价不排期 |
| B-P5z-V01～V04 | ✅ | 片区倒推验收（见 [13](./13-阶段B住宿区域实施计划.md)） |

---

## 4. 天气 / 联网 / Agent（多数 ⏸）

| ID | 状态 | 说明 |
|----|------|------|
| **WX-01/02** | ⏸ | 产品暂缓 |
| **WX-03/04** | 🔲 | Chat weather / rain_plan（等 WX-01） |
| **WS-01/02/03/05** | 🔲 | Tavily（暂缓主线） |
| **WS-04/06/07** | ✅ | EvidencePack + 侧栏 + TikHub |
| **WS-08** | 🔲 | Places 校验 UGC |
| **AG-01** | ✅ | 规则管道注入 generate |
| **AG-02/03/04** | 🔲 | 矩阵配置 / 意图路由 / 完整 Agent+KB |

---

## 5. 数据层 / Skill

| ID | 状态 | 待办 |
|----|------|------|
| **B-R-01/02** | ⏸ | Duffel / LetsFG 主链 |
| **B-SK-01/02** | 🔲 | travel-data-intelligence skill · 境外 KB YAML |

---

**建议实施顺序（B-P3 / UX-14 桌面完成后）**：

1. **`SEC-01b`** 运维轮换 · **`HOT-01`** 商务探路（非代码）  
2. **`DATA-10`** · **`GEO-09`** · **`HOT-02`** · **`B-FLT-03/04`**  
3. （⏸ **移动端 UX-14-07 / UX-M4** · WX/Tavily）· **`SEC-02`** 仅部署前  

> 偏离复核见 [20 §6](./20-L1L2运行验证记录.md)。

---

*清单版本：v1.8 · 2026-08-07 · 变更请同步 [总索引](../TODO.md)*
