# 24 · GitHub 旅行 Agent 调研 · 机酒/玩法顺序讨论

← [18-机酒优先](./18-机酒优先与迭代行程产品决策.md) · [15-Agent缺口](./15-天气联网与决策Agent缺口分析.md) · [21-印证多源](./21-Agent-Reach与玩法印证多源实施调研.md) · [25-能力借鉴与三档](./25-GitHub能力借鉴与规划策略三档分析.md) · [34-印证借鉴结论](./34-玩法印证与节点借鉴分析结论.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.0  
> **性质**：外部调研 + 产品讨论纪要（非实施计划）  
> **触发**：地图出现「酒店在胡志明、玩法钉在中央高地」；追问单次 LLM 是否可靠、是否该先玩法后机酒  
> **旁路产物**：Cursor Canvas `github-travel-agents-survey.canvas.tsx`（IDE 并排视图；**以本文为准**）

---

## 0. 结论摘要

| # | 结论 |
|---|------|
| 1 | GitHub 上「Multi-Agent Travel Planner」很多，**多数是角色 prompt + 网页搜索 → LLM 写行程**，与「一股脑塞 prompt」本质接近，只是拆成多次调用。 |
| 2 | 真正更稳的共性是：**真实 API 候选池 → LLM 只编排**；玩法侧再加 **封闭世界约束 + Reviewer/代码打分**。 |
| 3 | 学术基准 TravelPlanner 显示：即便有工具两阶段，**硬约束 Final Pass Rate 仍极低** → 盲生成不可靠。 |
| 4 | **主路径仍建议机酒优先**（与 [18](./18-机酒优先与迭代行程产品决策.md) 一致）；「先玩法」只适合目的地未定 / 跟笔记走等场景。 |
| 5 | 可借鉴的第三种路径：**轻量兴趣/必去清单（非完整草图）→ 机酒确认 → 封闭 POI 池精排**，而不是整表两轮 LLM。 |
| 6 | 本仓短板不在「没上多 Agent 框架」，而在 **玩法仍是 LLM 起名 → 事后 geocode**，且行程 geocode **未复用**住宿侧 IATA 围栏（GEO-11/12）。 |

---

## 1. 调研方法

| 项 | 说明 |
|----|------|
| 渠道 | GitHub Search API（`ai travel planner` / `travel planner agent` / `langgraph|crewai` 等）+ Web 检索 |
| 过滤 | 排除纯协作行程工具（如 TREK、AdventureLog）；保留 LLM/Agent 相关仓 |
| 核验 | 不只看 README 营销：核对星数、目录结构、关键源码（如 `agents/agent.py`、`trip_agents.py`） |
| 局限 | 星数随时间变化；部分仓「production-ready」自封；Amadeus 等 Key 门槛导致可复现性差 |
| 快照日 | 2026-08-10 |

---

## 2. GitHub 代表项目对照

> ★ 为查询时约数。

| 项目 | ★约 | 形态 | 玩法 / POI 怎么来 | 核验要点 |
|------|-----|------|-------------------|----------|
| [nirbar1985/ai-travel-agent](https://github.com/nirbar1985/ai-travel-agent) | 795 | **单 Agent + Tool 环**（LangGraph） | 几乎不做日玩法；SerpAPI 飞/酒店 | `call_tools_llm` ↔ `invoke_tools`；发信前 `interrupt_before` HITL |
| [OSU-NLP-Group/TravelPlanner](https://github.com/OSU-NLP-Group/TravelPlanner) | 536 | **学术基准**（ICML'24） | 工具检索 → 规划；或 sole-planning | 环境/常识/硬约束评测；Final Pass 普遍极低 |
| [embabel/tripper](https://github.com/embabel/tripper) | 152 | 确定性规划 + **MCP 工具** | 地图 / Airbnb / 网页搜索 | Embabel 领域模型；多 LLM；可观测事件流 |
| [CrewAI 官方 trip_planner](https://github.com/crewAIInc/crewAI-examples/tree/main/crews/trip_planner) | （随 examples） | 3 角色 Crew | Serper + 浏览器摘要 | City Selection / Local Expert / Concierge — 典型 demo |
| [kbhujbal/Multi-Agent-AI-Travel-Advisor](https://github.com/kbhujbal/Multi-Agent-AI-Travel-Advisor) | 55 | 3 AI + **并行 HTTP** | Places / Viator / Yelp 等 | 口号：**AI only does analysis**；数据不靠幻觉 |
| [LeeFly-cn/TripStar-Java](https://github.com/LeeFly-cn/TripStar-Java) | 51 | Spring AI Alibaba StateGraph | **小红书 → 高德 POI 校准** | 指定笔记模式：缺景点直接失败；Planner + Review |
| [shouzhuoshouzhuo/FloatTrip](https://github.com/shouzhuoshouzhuo/FloatTrip) | 36 | LangGraph 流水线 | **高德封闭 POI 池** + 地理聚类 | Planner⇄Reviewer + TimeCheck + pass@k 评测 |
| [AdritPal08/TravelPlanner-CrewAi-Agents-Streamlit](https://github.com/AdritPal08/TravelPlanner-CrewAi-Agents-Streamlit) | 60 | 7 角色 Crew | SERPER 网页为主 | 角色多，数据源仍偏搜索摘要 |
| [shaheennabi/Production-Ready-TripPlanner-…](https://github.com/shaheennabi/Production-Ready-TripPlanner-Multi-AI-Agents-Project) | 77 | TaskflowAI「Travel Agent」 | Amadeus 飞 + 天气 tool | 偏机酒 tool，非完整日玩法闭环 |
| [HarimxChoi/langgraph-travel-agent](https://github.com/HarimxChoi/langgraph-travel-agent) | 17 | LangGraph + 并行 tool | Amadeus 飞/酒/活动 | `asyncio.gather`；套餐生成 + HITL 表单 |

### 2.1 源码抽检：nirbar（高星 ≠ 多角色玩法）

```text
StateGraph:
  call_tools_llm ──(有 tool_calls)──► invoke_tools ──► call_tools_llm
                 └──(无 tool_calls)──► email_sender ──► END
  interrupt_before = [email_sender]   # 人确认后再发信
TOOLS = [flights_finder, hotels_finder]  # SerpAPI
```

含义：业界最火的「旅行 Agent」之一，核心是 **机酒 Tool 环 + HITL**，不是「每天去哪」的多 Agent 精排。

### 2.2 源码抽检：CrewAI 官方例（角色多 ≠ 事实库）

三角色均挂 `SearchTools.search_internet` + `BrowserTools.scrape_and_summarize_website`，最后由 Concierge 写行程。  
**数据路径 = 网页摘要 → LLM 综合**，无封闭 POI、无坐标围栏。

---

## 3. 业界实际落成的四种架构

| 代号 | 形态 | 常见实现 | 可靠性 | 代表 |
|------|------|----------|--------|------|
| **A** | 角色多 Agent（Crew） | 多次 LLM + Serper/Browse | 低–中（易幻觉 POI） | CrewAI 官方例、AdritPal |
| **B** | 单 Agent Tool 环 | ReAct / LangGraph tool loop | 机酒中–高；玩法弱 | nirbar |
| **C** | API 先行 + LLM 合成 | `asyncio.gather` 拉真 API → 1–3 次 LLM | 中–高 | kbhujbal、HarimxChoi |
| **D** | 封闭 POI + Planner/Reviewer | 地图 API 出池 → 只排序 → 代码/LLM 打回 | **玩法最高** | FloatTrip、TripStar |

```text
A  用户话 → Agent1 搜网 → Agent2 搜网 → Agent3 写行程
B  用户话 → LLM 决定调飞/酒 tool → 循环 →（可选 HITL）
C  用户话 → 并行 HTTP(飞/酒/景) → LLM 合成日程
D  用户话 → 地图 POI 池(+天气) → Planner ⇄ Reviewer → Finalize
```

**冷水**：README 写「7 specialized agents」时，要区分：

- **真并行 API 服务**（无 LLM）+ 少量合成 Agent → 接近 C，有价值  
- **7 个角色 prompt 都去搜网页** → 接近 A，成本高、事实仍软  

---

## 4. TravelPlanner 基准的启示

- 任务：给定 query，产出含交通/餐饮/景点/住宿的计划，并满足 **Environment / Commonsense / Hard** 约束。  
- 模式：two-stage（先 tool 搜集再规划）或 sole-planning（信息齐全只测规划；策略含 direct / CoT / ReAct / Reflexion）。  
- 公开结果与微调表：即便 SFT 后，Llama3.1-8B Final Pass 仍约 **3.8%** 量级；多数直推接近 0。  

**对产品含义**：多轮推理 / 多角色 ** alone 解决不了约束满足**；必须有可执行检查（预算、距离、营业时间、是否出池）与事实库。这与本仓「HARD 注入 + enforce 回写」方向一致，但玩法侧检查仍偏弱。

---

## 5. 对本仓现状的对照

| 能力 | 本仓 travel | GitHub 更稳做法 | 差距 |
|------|-------------|-----------------|------|
| 机酒 | 人机 Panel + `enforce_travel_intel_anchors` | Tool 搜 + HITL；或 Amadeus 并行 | 机酒路径 **相对强** |
| 玩法 POI | LLM 命名 → `geocode_itinerary(destination)` | 先 POI API 池，LLM 只排 | **主缺口** |
| 印证/UGC | 注入 prompt；`meta.evidence`；节点无 `evidence_refs` | TripStar：笔记 → 抽取 → 高德校准 → 缺项失败 | 有注入、无回写引用 |
| 编排 | 单次 `generate` + 规则后处理 | 图流水线 / Planner⇄Reviewer | 有意暂缓完整 Planner（[18 §3](./18-机酒优先与迭代行程产品决策.md)） |
| 地图落点 | 酒店 intel 坐标高置信；玩法围栏未钉 IATA | 候选自带 lat/lng | GEO-11/12 未复用到行程节点 |

### 5.1 与「单次塞 prompt」问题的关系

当前玩法生成是：

```text
确定性管道凑材料（intel / evidence / weather）
  → 单次 LLM generate
  → geocode / credibility / duration clamp
```

这属于 **C 的弱化版**（有注入，但玩法候选仍主要靠模型起名），**不是** D。  
上 CrewAI 壳子若仍让模型起名再 geocode，**不会自动修好胡志明错钉**。

---

## 6. 讨论：是否应「先玩法，再机酒」？

### 6.1 已拍板（[18](./18-机酒优先与迭代行程产品决策.md)）

> **不做「草图玩法→机酒→精排」两轮生成**。主路径 = **机酒锚点 → 玩法精排**。

### 6.2 「先玩法」的吸引力

- 玩法重心可反推酒店片区（逛滨城市场就不宜默认机场旁）。  
- 用户叙事常是「想去看 XX」，不是「先订这班飞机」。  
- FloatTrip / TripStar 等偏内容/POI 的产品也常「先定玩什么」。  

### 6.3 「先机酒」通常更稳的原因

| | 先玩法 → 机酒 | 先机酒 → 玩法（采纳） |
|--|--|--|
| 硬约束 | 航班时刻后到，玩法易整表重排 | 抵达/离开/住宿先钉死 |
| 用户心智 | 与「先订票」冲突；易感「做两遍」 | 与购票流程一致 |
| 成本 | 多一轮不可靠草图 LLM | 一次精排即可 |
| 地图错误 | 草图坐标更飘，片区跟着漂 | 酒店钉住后玩法应围着转（需 geocode 对称） |

**截图类错钉不是「因为先机酒」**，而是玩法未走同城候选池 / 围栏不对称。换成先玩法，若仍 LLM 起名再 geocode，照样会偏到越南中部。

### 6.4 产品分叉（机票 vs 酒店片区）

| 决策 | 是否需要完整玩法 | 建议 |
|------|------------------|------|
| 机票 | 否（城市 OD + 日期即可） | 机酒优先成立 |
| 酒店片区 | 受益于玩法重心，但可用启发式 | stay-zone / 偏好 / 机场锚，**不必先整表行程** |
| 迭代 | — | 精排后仍可改机酒 → `optimize` / `regenerate` |

### 6.5 建议的第三种（讨论共识倾向）

**不要**整表反转为「完整草图玩法 → 机酒 → 再精排」。  
**可以**做轻量前置：

```text
1. 兴趣 / 必去清单（标签 + 可选贴链印证）——不是完整日程
2. 机酒确认（城搜票 → 人点选；片区可被兴趣轻微 bias）
3. 玩法精排：硬吃机酒 + 从封闭 POI 池排序（非凭空造点）
```

### 6.6 何时认真考虑「玩法优先」

- 多城自由行、目的地未定（曼谷还是清迈？）  
- 「跟笔记走」模式（指定 UGC/攻略为骨架）  
- 无明确航班的纯当地游  

主路径是「有出发到达、要订机酒的出境/跨城行」时，**仍先机酒更好**。

---

## 7. 对本仓的可借鉴项（优先级讨论稿）

> 下列 **尚未立项为必须做**；写入 [TODO](./TODO.md) 前需产品确认。与 AG-02+「完整 Agent」刻意区分。

| 优先级 | 项 | 借鉴源 | 说明 |
|--------|-----|--------|------|
| P0 | 行程 geocode 复用 `GeocodePlaceContext` / IATA 钉围栏 + VN 别名 | 本仓 GEO-11/12 | 先修错钉，再谈架构 |
| P0–P1 | 玩法 **封闭候选池**（Places / 已核验 `poi_candidates` / 高德类）→ LLM 只排序 | FloatTrip、TripStar | 对可靠性增益最大 |
| P1 | 轻量 Reviewer 或代码规则（跨城距离、出池、开放时间） | FloatTrip G1–G7 | 不必上满 LangGraph |
| P1 | 节点 `evidence_refs` + 卡片展示引用 | 讨论 · TripStar 笔记模式 | 可解释性；位置展示依赖 P0 |
| P2 | 兴趣清单前置（非草图行程） | §6.5 | 改善片区 bias，不改机酒主序 |
| ⏸ | 完整多 Agent Planner | [18] 暂缓 | L1/L2 与封闭池稳后再议 |

---

## 8. 与相关文档的关系

| 文档 | 关系 |
|------|------|
| [18](./18-机酒优先与迭代行程产品决策.md) | 机酒→玩法拍板；本文 §6 复核后 **不推翻** |
| [15](./15-天气联网与决策Agent缺口分析.md) | AG-1「规则 + Tool 注入」与本文架构 C 对齐 |
| [16](./16-产品能力优先级纠偏分析.md) | 完整 Planner 暂缓；本文支持「先封闭池，不先堆 Agent」 |
| [21](./21-Agent-Reach与玩法印证多源实施调研.md) / [23](./23-玩法印证贴链MVP实施.md) | 印证注入已有；本文补「引用回写 / 笔记→POI 校准」对照 |
| [34](./34-玩法印证与节点借鉴分析结论.md) | 印证「部分重合→借鉴」核对与端到端流程；与封闭池同向 |
| [03](./03-游玩项目.md) | 游玩品类与票务；封闭池落地时对齐 |
| [25](./25-GitHub能力借鉴与规划策略三档分析.md) | 可借能力矩阵 + 规划策略三档 UI 固化（本文后续） |

---

## 9. 参考链接

- https://github.com/nirbar1985/ai-travel-agent  
- https://github.com/OSU-NLP-Group/TravelPlanner  
- https://github.com/embabel/tripper  
- https://github.com/crewAIInc/crewAI-examples/tree/main/crews/trip_planner  
- https://github.com/kbhujbal/Multi-Agent-AI-Travel-Advisor  
- https://github.com/LeeFly-cn/TripStar-Java  
- https://github.com/shouzhuoshouzhuo/FloatTrip  
- Paper: *TravelPlanner: A Benchmark for Real-World Planning with Language Agents* (arXiv:2402.01622)

---

*文档版本：v1.0 · 2026-08-10*
