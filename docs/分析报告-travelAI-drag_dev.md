# travelAI · `drag_dev` 分支 docs 实现可行性 & 漏洞审查

> 审查对象：`github.com/AirSmithZ/travelAI` 的 `drag_dev` 分支 `docs/` 下的 TODO 文档 + 相关分析文档，并交叉核对 `backend/`、`frontend/` 实际代码。
> 审查日期：2026-08-06
> 方法：文档静态阅读 + 代码/Git 证据核验（非运行时 E2E）。

---

## 0. 一句话结论

**实现思路整体方向是对的（机酒优先 → 玩法精排、拖拽总览、地理围栏修错点），但「用户主诉（geocode 错点）」与「行程不服机酒（L2 锚点）」两大核心问题在当前代码里根本没修；更致命的是仓库把一份含登录 Cookie 的 Chrome 用户档案提交了进来，这是 P0 级安全/合规事故，且完全不在任何 TODO 里。**

---

## 1. 已在代码/Git 中核实的事实（证据）

| # | 事实 | 证据 |
|---|------|------|
| F1 | **批量 geocode 盲信 Top1、无围栏** | `backend/app/services/geocoding.py:71` `result = geocode_autocomplete(name, destination, limit=1)`；`:75` `first = result.results[0]`；`geocode_providers.py:146-175` 的 `run_autocomplete` 无 `bbox/countrycodes/viewbox`、无距离校验，首个变体命中即 return |
| F2 | **generate 完全不读 `travel_intel`/航班** | `backend/app/services/itinerary_llm.py` 全文 grep `travel_intel\|flights\|hard\|constrain` **0 命中**；仅从 `trip_request` 生成 |
| F3 | **天气是 stub，未接和风** | `backend/app/services/weather_tool.py` 仅 `stub_fetch_weather`，返回 LLM 推断或占位；`QWEATHER_*` 未调用 |
| F4 | **`.env` 已正确忽略**；只跟踪 `.env.example` | `git ls-files` 仅 `.env.example`；`.gitignore` 含 `.env` |
| F5 | **`backend/app/data/` 已跟踪**（city_aliases.py、mock_singapore.json 均在） | `git ls-files` 可见 → 文档 GEO-04「city_aliases 可能不进仓库」的担忧**实际已解决**（gitignore 用 `/data/` 仅限根目录） |
| F6 | **提交了一份完整 Chrome 用户档案** | `git ls-files` 含 `.edreams_chrome_data/Default/Cookies`、`Account Web Data`、`Local State` 等，共 2.0 MB |
| F7 | **CORS 仅 localhost，无接口鉴权** | `backend/app/config.py:40` `cors_origins` 默认 `http://localhost:5173,...`；`main.py` 仅 `CORSMiddleware`；`itineraries.py` 无 `Depends(auth)`（仅 `get_llm_client`） |

---

## 2. 关键决策的可行性评估

| 决策（文档出处） | 可行性 | 判断与风险 |
|------------------|--------|-----------|
| **GEO-01/02 地理围栏 + Top1 距离校验 + 超时策略**（17 §3.3） | ✅ 可行 | 标准做法：目的地中心 + `bbox`/`countrycodes` + 命中后距中心校验。唯一难点是 **Photon 对中文 POI 常 0 features**，需靠「中文名→英译/官方名变体 + 退回 Nominatim + 缩短超时」缓解。工作量中，风险低。 |
| **B-P4 generate 注入 `travel_intel` 硬约束**（06 §7 / 18） | ✅ 可行 | 把已确认航班时刻/机场、住宿片区作为 prompt 硬约束即可，中等工作量。**必须先于 GEO 修复**——否则锚点坐标也是错的，约束"约束在错误地点上"（17 §1 已点明）。 |
| **机酒「性价比」排序 5:2:2:1**（18 §5.3） | ⚠️ 部分可行 | 权重可落地，但**"性价比"目标函数未对用户公式化**（17 §5.2 已承认 Ignav 参考价是否=用户口径未定义）；且 Ignav=参考价、酒店无库存 API，**L3 报价级本就不保证**。排序排在不可验证数据上意义有限。 |
| **天气/联网 Agent（WX/WS/AG）暂缓**（15 / 16 纠偏） | ✅ 合理 | 当前 L1/L2 不稳，先不扩是正确取舍。风险是**暂缓期间攻略事实/开放时间/签证仍靠 LLM 参数记忆 → 幻觉**，需在前端明确标注"未联网核实"。 |
| **Planner 用"规则 + 显式 Tool 编排"先做 AG-1**（15 §3.3） | ✅ 可行且正确 | 不上 LangGraph DAG 是务实选择；规则表驱动 fetch_weather/web_search 注入 generate。 |
| **拖拽总览 / 单日路线图**（总览图连接线问题分析） | ✅ 已实现 | 文档称 P0–P2 已修复（三层矩阵、边框锚点、拖拽同步）。可行性无虞；**移动端触控拖拽（UX-M4-02）尚未开始**。 |
| **移动端 Phase 4** | ⚠️ 未启动 | 无代码、无设计细化，纯占位 TODO。风险是响应式/触控是独立工程量。 |
| **深链"展示不自动打开"**（18 §5.3 拍板） | ⚠️ 待核验 | 文档明确"不自动 open"，但代码侧 `tripcom_deeplink` 是否真不自动打开需运行时核验（FLOW-01 门禁项仍 🔲）。**若实现误自动打开外部 OTA，既扰民又有安全/合规风险。** |

---

## 3. 漏洞清单（按严重度）

### 🔴 P0

- **V1 · 仓库提交了含 Cookie 的 Chrome 用户档案（安全/合规事故）**
  - 位置：`.edreams_chrome_data/`（已 `git tracked`，含 `Default/Cookies`、`Account Web Data`、`Local State`）。
  - 影响：泄露浏览器登录会话/账号凭证；且该目录疑似用于持久化浏览器自动化抓取 eDreams/Trip.com（docs 多处提到 Apify trip-com-scraper、Trip.com 自动化）。**违反 OTA 站点 ToS 风险 + 凭证泄露**。
  - 建议：**立即** `git rm -r --cached .edreams_chrome_data` 并加入 `.gitignore`；若曾 push，轮换相关账号密码；自查是否还有别的会话文件。此条**完全未出现在任何 TODO**（最大盲点）。

- **V2 · 生成行程 geocode 全错（用户主诉根因）**
  - 位置：`geocoding.py:71,75` + `geocode_providers.py:146-175`。
  - 问题：批量 geocode 对每个节点只取 autocomplete **第 1 条**、无国家/城市围栏、无"结果必须落在目的地附近"校验 → 同名异地 POI（中央公园、星巴克、港口、清真寺）飞到错误半球。
  - 影响：地图渲染错点（F1）。`hasMapCoords` 只要非 (0,0) 就画 → 错点可见。
  - 建议：GEO-01/02/03（围栏 + 距离校验 + 英译变体）。**注意**：此前 P61–P66 只修了 `NodeCoordEditor` 的 UI 联想路径，**生成批处理路径并未修**，别误以为已解决。

- **V3 · generate 不读机酒锚点（L2 失效的真因）**
  - 位置：`itinerary_llm.py`（F2）。
  - 问题：已确认的航班时刻/机场、住宿片区不会进入生成 prompt → Day1 仍写"上午逛牛车水"、住宿不在推荐片区。
  - 影响：用户感知的"行程不服机酒"。
  - 建议：B-P4-01/02 注入硬约束 + B-P4-03 未确认航班阻断首次 generate。

- **V4 · 批量 geocode 性能/可用性灾难（约 11 分钟）**
  - 位置：Nominatim 15s 超时 × 查询变体 × 并行（17 §3.2）。
  - 影响：生成后批量打坐标卡 10+ 分钟；中文 POI 在 Photon 0 features 时全压到 Nominatim。
  - 建议：缩短超时、失败快跳、并行上限、缓存命中。

### 🟠 P1

- **V5 · `timezone` 全硬编码 `Asia/Singapore`**（前端数据格式分析 §4.1 / §6.5）
  - 非新加坡目的地天气/时间全错；类型字段已存在却不用映射表。
- **V6 · 日期用 `date.today()` 而非 `TripRequest.date_start`**（同上 §6.4）
  - 生成的 `days[].date` 与现实出行日历错位，排序/导出/周几都错。
- **V7 · 两份 diverged Mock 源**（前端 `mockSingapore.ts` vs 后端 `mock_singapore.json`，同上 §4.4）
  - 同按钮不同环境图结构不同（前端 6 节点/含 T2 备选/含 tags，后端 5 节点/无）；后端 mock 缺 `tags/scene_group/cost`，生成的图远弱于 Mock 演示。
- **V8 · `compactItineraryForParse` 裁剪过狠 + FormPatch 白名单不全**（同上 §4.5 / §6.9 / §6.10）
  - supplement 上下文看不到 `tags/tips/cost/scene_group/coords`；chat 改不了 `scene_group/duration_minutes/address/coords/overview_offset` → 编辑器能改、对话不能改，交互割裂且降低补充质量。
- **V9 · 后端 `dict[str, Any]` 无 Pydantic 校验**（同上 §6.2）
  - generate/geocode 出参无强类型，前后端 schema drift 难早期发现。
- **V10 · LLM 输出 schema 缺 `tags/scene_group/alternative` 边**（同上 §6.6）
  - Mock 演示的核心 UX（备选餐厅、机场 T1/T2 分组）在 LLM 路径完全缺失，图拓扑弱于 Mock。
- **V11 · `region` 自由文本无归一化**（同上 §6.13）
  - "市中心/市区/CBD" 同义不同名 → 总览产生空行/重复行。
- **V12 · 机票"性价比"公式未定义即拍板排序权重**（17 §5.2 / 18 §5.3）
  - 5:2:2:1 可落地，但"性价比=用户口径"未建模；排在参考价上易误导。**建议先与用户确认打分公式再写死权重。**
- **V13 · 天气/联网 Key 已配但 stub 未接 → LLM 幻觉事实**（15）
  - 开放时间/票价/签证仍靠模型记忆；且"禁止用联网摘票价"仅是文档规则，**代码层无强制**，generate 仍可能编造。

### 🟡 P2

- **V14 · `localStorage` 版本/键名遗留**（`travel_plans_v1` 实际存 v2；设计文档 §6.6 仍写 `version:1`，同上 §2.1/§6.3）→ 文档与代码契约不一致。
- **V15 · 无后端持久化**（仅 localStorage）→ 清缓存/换设备行程即丢；设计文档暗示后端存储需对齐。
- **V16 · 前端 Mock 日期不连续**（Day1 `2026-10-16` → Day2 `2026-10-18` 缺 17，同上 §3.3）→ 测试样本误导。
- **V17 · `region` 同义不同名 / POI 跨天重复**（金沙酒店两节点 + cross_day 边模拟隔夜，同上 §6.11）→ 建议引入 `place_id` 去重。
- **V18 · CORS `allow_credentials=True` 且无鉴权**（F7）→ 本地 dev 可接受；**一旦部署公网，generate 会无限制消耗 LLM 配额且可被滥用**，需加鉴权/限速。
- **V19 · P60 自动 generate 与 R6 冲突被"忽略"**（问题日志 P60）→ 确认 trip_request patch 后自动触发 generate，可能误重生成、浪费配额。
- **V20 · 拖拽在移动端未做**（UX-M4-02）→ 触控拖拽节点/总览列缺失。

### ⚪ 文档/状态不一致（影响 TODO 失真）

- **V21 · 文档状态与代码不符**
  - `开发进度.md` 标 P3–P4 机酒流程 ⏳，但 `TODO.md` 把 `B-P4-*` 标 P0 未做 → 两处对"是否完成"表述冲突。
  - `17 §3.2` 称 city_aliases 可能不进仓库（GEO-04 🔧待 commit），实际已跟踪（F5）→ 文档滞后于代码。
  - `TODO-路线图与总览.md` 标注大量 OV/FM 项 🔲，但正文又说"设计文档历史项多为历史计划已交付"——口径需统一。
- **V22 · GEO 修复范围被低估**：P61–P66 只修 UI 联想路径，用户主诉的"生成批处理 geocode 错点"仍是 F1 状态，别被"地理编码已修复 ✅"误导。

---

## 4. TODO 优先级排序评估

**合理处**：GEO-01/02（P0，对准主诉）、B-P4（P0）、WX/WS 暂缓（服从 L1/L2 不稳）的排序是**对的**；GEO 先于 B-P4 的顺序（17 §6）也正确。

**问题**：
1. **最大盲点**：V1（提交 Chrome 档案）**完全不在任何 TODO 中**，应立刻插入 P0 安全项。
2. **数据契约类漏洞（V5–V11）被低估**：timezone 硬编码、日期错位、双 Mock 漂移、schema 缺字段，直接影响"生成的图能不能用"，建议提到 P0/P1 而非仅写在分析文档的"优化建议"。
3. **UX-14 预览区折叠标 P0 略突兀**：在 geocode 错点这一用户主诉未解时，折叠右栏属于体验抛光，优先级可降到 P1。
4. **FLOW-01 门禁（阻断首次 generate）仍 🔲**：与 B-P4-03 强相关，应同批，避免"锚点没确认就生成错误行程"。

---

## 5. 最想强调的 5 条结论

1. **用户主诉（geocode 错点）根因已确认且可行修复**：批量 geocode 盲信 Top1、无围栏（F1）。GEO-01/02 方案标准可行，但**生成批处理路径此前没修**（V22），别被"地理编码已修复 ✅"误导。
2. **真正的"行程不服机酒"是因为 generate 根本没读机酒锚点**（F2，V3）——这不是产品选择，是**功能未实现**；B-P4 是 P0 正确，但务必排在 GEO 修复之后。
3. **最大隐患是安全/合规，不是功能**：仓库把含 Cookie 的 Chrome 用户档案提交进 git，疑似用于 OTA 抓取（V1）。立即移除+轮换凭证，且它**不在任何 TODO**——说明文档体系漏了安全维度。
4. **数据契约严重漂移正在悄悄降低产品质量**：timezone 硬编码、日期用 today、双 Mock 不一致、LLM schema 缺字段、supplement 被裁剪（V5–V11）。建议先上 Pydantic 强类型 + 单一 Mock 源，再谈功能扩张。
5. **文档与代码状态多处对不上**（V21），TODO 优先级因此失真。建议做一次"文档↔代码对齐体检"，把 V1、V5–V11 正式纳入 TODO 并定级，否则后续排期会继续偏。

---

## 6. 建议的下一步（收敛版）

1. **P0 安全**：`git rm -r --cached .edreams_chrome_data` + `.gitignore` + 轮换账号（V1）。
2. **P0 GEO**：目的地中心 + `bbox/countrycodes` + 距离校验 + 超时/缓存（V2/V4）；修的是 `geocoding.py` 批处理路径。
3. **P0 B-P4**：generate 注入 `travel_intel` 硬约束 + 未确认航班阻断（V3/FLOW-01）。
4. **P1 数据契约**：Pydantic `Itinerary`、单一 Mock 源、timezone 映射、日期取 `TripRequest`、扩 LLM schema（V5–V11）。
5. **P1 诚实度**：天气/联网接通前，前端标注"未联网核实"；禁止 LLM 编票价的规则落到代码（V13）。
6. **文档对齐**：把上述安全/数据项补进 TODO 并定级，统一开发进度与 TODO 的状态口径（V21/V22）。
