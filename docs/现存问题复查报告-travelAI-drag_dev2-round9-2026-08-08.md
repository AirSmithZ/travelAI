# travelAI · 现存问题复查报告（第九轮 / Round 9）
分支：`drag_dev2` @ HEAD `8bbeefefcec6ddcbd0dd9401940b4f8a70c6c2b9`（"feat: add charge panel"，2026-08-08）
父提交 `58c5dd1`（注意：HEAD 已从上轮 `4e87221` 被重置/变基，本轮回溯全部基于 HEAD 远端原始文件）

---

## 〇、本轮方法
- 取分支最新 commit（`branches/drag_dev2`）确认 HEAD 已变动。
- 用分支 ref `drag_dev2` 重新拉取上轮定位的关键文件 + 本次新增文件，逐文件核实。
- 全部结论基于远端原始文件，不依赖本地克隆。

---

## 一、上轮（Round 8）问题 — 当前状态

| 上轮问题 | 当前状态 | 证据 |
|---|---|---|
| **P1 WS-08 印证校验（verified / poi_candidates）文档超前、代码未实现** | ✅ **已真正修复** | `itinerary_llm.py`：`from app.services.ugc.poi_extract import enrich_evidence_pois`，`_load_evidence_for_generate` 返回 `(evidence, poi_candidates)`，`_attach_evidence_meta` 写 `meta["evidence"]` + `meta["poi_candidates"]`，evidence 项带 `verified`/`poi_hits`。`EvidencePanel.tsx` 渲染「已核验地点」列表 + 每条「含已定位地点 / 仅网友提及」徽标。`types/itinerary.ts` 的 `ItineraryEvidenceItem`(含 verified/poi_hits) 与 `ItineraryPoiCandidate`(place_id/rating/place_types/hours_text/open_state…) 与后端形状**完全对齐**。 |
| **P2 证据功能在无 TikHub 配置时静默消失** | ❌ **仍存在（中）** | `InputPanel.tsx` 中「参考依据」入口按钮仍以 `evidenceCount > 0` 为前置条件；TikHub 未配置时 `fetch_evidence_pack` 返回 `[]` → `meta.evidence` 不写 → 入口不显示，且无「未配置数据源」提示（打开后才有"可能上游未返回或未配置"空态文案，但进不去）。 |
| **P2 FLOW-02 optimize/regenerate 后端已接通但未启用** | ⚠️ **后端更完善，前端仍无入口（低）** | 后端 `_require_generate_mode` 已加 400 门禁（`optimize` 缺 `current_itinerary` 直接 400，见 `itineraries.py`）；但前端 `usePlanStore.ts` 所有 `generateItinerary()` 调用仍走默认 `'generate'`，`ChatPanel.tsx` 从不调用 `generateItinerary`。属"能力已预留并校验、仅未在前端暴露"，不再是崩溃风险，降为低优先。 |
| **P3 契约微缺口（note_id）** | ✅ **已改善** | `ItineraryEvidenceItem` 现已含 `verified?`/`poi_hits?`，契约比上轮更完整；`note_id?` 仍为可选（后端未必产），但 EvidencePanel 用 `note_id||url||title` 回退，无渲染错误。 |

> 结论：用户这次更新**正面解决了 P1（也是上轮最关键、且被文档夸大的点）**，并实现得相当健壮（全程 `try/except` 软失败、不向 generate 抛异常）。

---

## 二、本次提交引入的新问题（需关注）

### 🟠 P2（新）OPS 用量/计费面板接口无鉴权
来源：`backend/app/api/v1/ops.py`（新增）+ `ops_provider_accounts.py`（新增）+ `ops.html`。

- `GET /api/v1/ops/usage` 与 `POST /api/v1/ops/usage/reset` **均无任何 auth 依赖**（无 API key / admin / IP 限制）。
- `POST .../reset`：任何人只要能访问该端点即可**清零全局进程内用量账本**（`get_usage_ledger().reset()` + 清空账户缓存）。破坏性与影响限于"指标清零/审计 obfuscation"，不直接丢数据。
- `GET .../usage`：在无鉴权下披露各厂**账户余额 / 剩余额度 / 用量**，且 `ops_provider_accounts.py` 的 TikHub 账户返回里含 **`email`（账号邮箱，PII）**。
- **好的一面**：`ops_provider_accounts.py` **不返回任何原始 API key**，只返回余额/额度/邮箱；密钥仅用于服务端出站调用。所以没有密钥泄露。
- **风险定性**：属于与上轮"无鉴权 /generate"同类（P2）。若仅本机 `localhost:5173/ops.html` 开发自用，可接受；**一旦部署到任何共享/公网环境，即为开放的"可篡改指标 + 信息披露(含 PII)"端点**，必须加守卫。
- **建议**：① 给 `/ops/*` 加共享密钥 / admin 中间件；② 或仅绑定 `127.0.0.1`；③ `GET` 返回的 `accounts` 中的 `email` 等 PII 在共享部署前脱敏。

### 🟡 P3（新）OPS `GET /usage` 同步串行调用 5 个外部 API，阻塞 worker
`fetch_provider_accounts` 在 `GET /usage` 请求内**顺序同步**调用 DeepSeek / SerpAPI / Tavily / TikHub / QWeather 余额接口（各 `timeout=8s`），最长约 40s；且 `/ops/usage` 是同步 `def` 路由 → 在请求期间**阻塞事件循环 / worker**，无聚合超时；`?refresh_accounts=true` 还会同步重新拉取。
- **建议**：改为 `async` + `asyncio.gather` 并发，或把账户拉取移出请求路径（后台定时刷新缓存）；至少加聚合超时。属于可用性问题，非安全。

### 🟡 P3（新，轻微）`enrich_evidence_pois` 原地修改入参
`poi_extract.py` 的 `_mark_evidence_verified` 直接 `item["verified"]=...` / `item["poi_hits"]=...` **原地修改传入的 evidence 列表**。功能上安全（下游 `_format_evidence_block` 只取 title/url/snippet/source），但属于"有副作用的就地变更"代码异味，后续若同一列表被复用易踩坑。
- **建议**：改为返回新列表而非改入参。

---

## 三、本次提交的正面改动（确认无新问题）
- **WX-01 和风天气真实接入**（`qweather_forecast.py` / `qweather_geo.py`）：补齐了此前 TODO 里的"天气 stub"，提供真实联网天气。
- **行程可信度审计**（`itinerary_credibility.py` + `itineraries.py` 的 `_post_geocode_credibility`）：在 geocode 后追加通勤负载 warning，**数据全为服务端派生（结构化）**，无用户自由文本注入 LLM，无新端点，安全。
- **FLOW-01b / FLOW-02 后端门禁齐备**：`_require_confirmed_flights`（无航班 400）、`_require_generate_mode`（optimize 缺 current_itinerary 400）均在 `/generate` 与 `/generate/stream` 生效。
- **用量可观测**：各外部 API 调用处埋点 `api_usage`，开发期可看成本。

---

## 四、给项目的建议（按优先级）
1. **（P2）OPS 面板加鉴权 / 限绑定**：`/ops/*` 上线任何非本机环境前必须加 admin 守卫或仅绑 `127.0.0.1`；`GET` 返回的 `email` 等 PII 脱敏。
2. **（P2）证据功能可发现性**：TikHub 未配置 / 无印证时，前端应显示「未配置公开笔记数据源 / 本次无印证链接」占位与说明，而不是让「参考依据」入口直接消失。
3. **（低）FLOW-02 暴露或标注**：要么在 UI 增加「优化 / 重生成」入口（后端已支持且 400 校验完备），要么在文档明确标注为"预留能力未开放"。
4. **（P3）OPS `GET /usage` 改为并发 + 聚合超时**，避免阻塞 worker。
5. **（P3）`enrich_evidence_pois` 改为纯函数**（不改入参）。

---

## 五、本轮核实文件清单（均取自 HEAD `8bbeef` raw / API）
- 提交：`api.github.com/.../commits/8bbeefefcec6ddcbd0dd9401940b4f8a70c6c2b9`（22 文件）
- `backend/app/services/itinerary_llm.py`、`backend/app/services/ugc/poi_extract.py`
- `backend/app/api/v1/itineraries.py`、`backend/app/api/v1/ops.py`、`backend/app/services/ops_provider_accounts.py`
- `frontend/src/components/evidence/EvidencePanel.tsx`、`frontend/src/components/input/InputPanel.tsx`
- `frontend/src/stores/usePlanStore.ts`、`frontend/src/components/chat/ChatPanel.tsx`
- `frontend/src/types/itinerary.ts`
