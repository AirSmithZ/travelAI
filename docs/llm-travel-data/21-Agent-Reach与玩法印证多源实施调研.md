# Agent Reach 调研与玩法印证多源实施分析

← [19-玩法印证](./19-玩法印证与UGC数据源分析.md) · [18-机酒优先](./18-机酒优先与迭代行程产品决策.md) · [16-优先级纠偏](./16-产品能力优先级纠偏分析.md) · [TODO](./TODO.md) · **产品 UX 衔接**：[22-对话编排](./22-对话编排与玩法印证UX调研.md)

> **日期**：2026-08-08 · **版本**：v1.2 · **实施**：Phase 0–1 ✅；**成本决策：保留 TikHub**；Phase 2（`WS-CACHE` / `WS-08a` / `UX-EVD-01`）✅；`WS-08b` Places 开放  

> **对象**：[Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)  
> **问题**：能否比 Tavily「盲目搜索」更贴切地拿到旅行玩法参考？若整包替代困难，是否另写一套更好？如何实施才能提高行程玩法可行性？

---

## 0. 一句话结论

| 判断 | 结论 |
|------|------|
| Agent-Reach 能否提升旅游参考质量？ | **能**，强在小红书 / Reddit / B 站等**平台直连 UGC**，弱在当 SaaS 后端主链 |
| 能否整包替代 Tavily？ | **否**。全网搜索它接的是 Exa；与 Tavily 同属「网页检索」，不是旅游杀手锏 |
| 是否另写一套 Evidence 系统？ | **否**。应扩展现有 `EvidenceItem` / `EvidencePack`，加多 provider |
| 怎样更贴切提高玩法可行性？ | **分层取证 + 结构化抽取 + Places 校验 + 机酒硬约束**；检索只是第一步 |

当前仓库已具备：TikHub → `EvidencePack`（含分槽 query + `filter_evidence`）→ generate 注入 → `meta.evidence` → **基础 EvidencePanel**（左栏 `evidence` 模式，可点 URL；WS-04/06/07 主体）。  
缺口不在「再造管道 / 有没有面板」，而在 **多源 fact、POI 抽取、Places 核验分层（WS-08）、面板「已核验 vs 仅网友」与「非官方」文案（见 [22](./22-对话编排与玩法印证UX调研.md) · `UX-EVD-01`）**。  
> 注：早期组合评估曾误判「仅有 toast、无面板」——那是针对更旧快照；以本节与 [组合评估 §四](../doc21-22-玩法印证组合评估.md) 为准。

### 0.1 成本决策（2026-08-08 拍板）

| 判断 | 结论 |
|------|------|
| Agent-Reach「免费」能否替代 TikHub 生产主源？ | **否（当前无法用数据证明更优，且工程形态不适合多租户）** |
| 是否因 TikHub 收费而改接 Reach CLI？ | **否**。Reach 现金成本低，但会话/封号/运维成本高；bench 中 `agent_reach_xhs` 仍为对照 stub |
| **生产 pattern 主源** | **保持 TikHub** |
| 控费手段 | **Evidence TTL 缓存**、无 Key/失败软降级、可选关 POI 校验以少打 geocode |
| 低成本辅源 | **Tavily authority**（fact 软合并，有 Key 才调） |
| 可落地主杠杆 | **先轻量：抽 POI + 现有 geocode 围栏**；完整 Google Places（WS-08 重型）单独立项 |
| Reach 角色 | 本机调研 / 未来补全 bench 对照；**禁止**嵌进 `generate` |

未跑出 hit@k 对照表前，不以「感觉 Reach 更便宜」换主源。若日后 CLI 对照证明质量持平且产品改为单机，再单独立项自建 XHS 通道——仍非整包嵌 Reach。

---

## 1. Agent-Reach 是什么（调研摘要）

### 1.1 定位

Agent Reach 是给 AI Agent（Cursor / Claude Code / OpenClaw 等）用的 **能力安装 / 路由 / 体检层（CLI）**，不是搜索 SaaS，也不包装一层统一检索 API。

> 选型、安装、体检、路由；读取由 Agent **直接调用上游工具**完成。

### 1.2 与旅行相关的渠道

| 渠道 | 上游 | 零配置？ | 旅行用途 |
|------|------|---------|----------|
| 全网搜索 | **Exa** via mcporter | 需 MCP 配置 | 语义网页检索（≈ Tavily 角色） |
| 小红书 | OpenCLI / xiaohongshu-mcp / xhs-cli | 需登录态 | **中文高赞行程例子** |
| Reddit | OpenCLI / rdt-cli | 需登录态 | 英文行程结构、避坑 |
| B 站 / YouTube | bili-cli / yt-dlp | 基本可用 | 视频攻略、字幕 |
| 任意网页 | Jina Reader | 是 | 读官方站、游记全文 |
| RSS / GitHub 等 | feedparser / gh | 是 | 弱相关 |

### 1.3 对产品的关键含义

1. **桌面 Agent 友好，服务端多租户不友好**：小红书等依赖 Chrome 会话 / Cookie；服务器路径要常驻 MCP + Cookie 维护，且有封号风险（官方文档亦建议小号）。
2. **「免费零 Key」≠ 生产零成本**：平台风控换代、代理、会话失效是持续运维。
3. **学理念，不嵌整包**：理念是「平台直连 UGC > 盲目网页搜」；实现应落在你们已有的 REST EvidencePack，而不是把 CLI 嵌进 `generate`。

仓库现状对照见 [19 §8.1.1](./19-玩法印证与UGC数据源分析.md)：TikHub 已作 UGC 主 API；**Tavily authority 已软合并进 `fetch_evidence_pack`**（有 Key 才调用；非强制主链）。完整 WS-01/05 网页桶与缓存 TTL 仍可按 bench 结果再开。

---

## 2. 与现有栈对比：谁负责什么

沿用 [19 §2.2](./19-玩法印证与UGC数据源分析.md) 可信度分层——**混用会伤害可行性**：

```text
L-geo     点在哪、能否落地     → Geocode / Places（主线 GEO · WS-08）
L-fact    开放/预约/规则       → 官方站 + Tavily/Exa 定向（域名白名单）
L-pattern 怎么排日子、常见组合 → TikHub 小红书 /（评测用）Agent-Reach XHS / Reddit
L-price   多少钱               → Ignav / OTA；禁止网页摘要当价
```

| 能力 | TikHub（已接） | Tavily（Key 有，未接） | Exa（Agent-Reach 选用） | Agent-Reach 整包 |
|------|----------------|------------------------|-------------------------|------------------|
| 工程形态 | REST，适合后端 | REST，适合后端 | REST/MCP | CLI + 本机会话 |
| 中文 UGC 高赞 | ✅ 结构化 | 仅 `site:` 索引残片 | 弱 | ✅ 直连，但不稳定合规 |
| 权威事实页 | 弱 | ✅ `include_domains` | ✅ 语义 + 可滤域名 | 间接 |
| 一次返回 RAG 摘要 | 笔记字段 | ✅ 强 | 中（常需二次 contents） | 视上游 |
| 与 `EvidenceItem` 对齐 | ✅ 已有 | 易映射 | 易映射 | 需适配器，难生产 |

**Exa vs Tavily（网页层）**：Exa 偏语义发现；Tavily 偏 agent/RAG 一次返回可注入文本。对「大阪 5 天自由行」类明确关键词 query，二者重叠高；**真正拉开差距的是「有没有小红书级例子」**，而这是 TikHub / XHS 通道的事，不是换 Exa 能单独解决的。

---

## 3. 战略选择：扩展 EvidencePack，不替代、不重写

### 3.1 三个否决项

| 方案 | 否决理由 |
|------|----------|
| A. 用 Agent-Reach **替代** TikHub/Tavily | 架构不匹配；合规风险与 [19] 已拍板「XHS 不做主源」冲突；与现侧栏/注入重复 |
| B. **另写一套**玩法印证系统 | `EvidenceItem` 契约已服务 generate + UI；重写零收益 |
| C. 只用 Tavily 盲目搜替代 UGC | 丢「像帖子一样的玩法心智」；对中文行程例子命中差 |

### 3.2 推荐方案：多 Provider → 同一 EvidencePack

```text
                    ┌─ tikhub_xhs      (L-pattern，已有)
fetch_evidence_pack ┼─ tavily_authority (L-fact，WS-01/05)
                    ├─ tavily_general   (辅，可选)
                    └─ exa              (bench 后决定；默认可不做)
                         │
                         ▼
              list[EvidenceItem]  merge / 截断 / 缓存
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   Prompt 注入     meta.evidence[]    （下一阶段）
   UNTRUSTED_UGC   EvidencePanel      POI 抽取 → Places 校验
```

`EvidenceItem` 保持现字段（可增可选字段，勿破坏前端）：

```text
title, url, snippet, likes?, source, query?, note_id?
# 可选扩展（实施时再加，向后兼容）:
# role: "pattern" | "fact"     — 注入时权重不同
# poi_hints: string[]          — 预抽取地名，供 WS-08
```

Agent-Reach **仅允许**出现在：

- 研发本机调研 / Skill；或  
- `bench_evidence_providers.py` 的可选 CLI provider（`--allow-cli`）；  
- **禁止**进入生产 `generate` 主路径。

---

## 4. 怎样「更贴切」拿到匹配数据（核心）

「贴切」不是搜到更多链接，而是：**检索结果能约束模型排出可落地、可走通的玩法**。建议把链路拆成五步，每步有明确成功标准。

### 4.1 目标函数（产品语言）

一次成功的玩法印证应同时满足：

1. **模式命中**：Evidence 中反复出现的 POI / 片区组合，与最终行程高度重叠（非冷门编造）。  
2. **可落地**：这些 POI 经 geocode/Places 有坐标、类型合理（非假店/错城）。  
3. **可走通**：日序服从机酒抵达/返程与住宿区（HARD CONSTRAINTS 优先于 UGC）。  
4. **可追溯**：侧栏每条有真实 URL；禁止「小红书 10w 赞」类无出处话术。

检索质量只服务 1；2–3 决定「可行性」；4 决定信任。

### 4.2 第一步：Query 工程（比换搜索引擎更重要）

现状（`evidence_queries`）过粗：

```text
"{dest} 自由行 {n}天"
"{dest} itinerary"
```

问题：易命中酒店/签证/机票软文；缺片区、主题、季节、避坑维度；中英各一条不够。

**建议模板分层（每趟仍限总 search 次数，如 ≤4）**：

| 槽位 | 模板示例 | 目的 |
|------|----------|------|
| P1 日序 | `{dest} 自由行 {n}天 行程` / `{dest} {n}-day itinerary` | L-pattern 主召回 |
| P2 避坑 | `{dest} 避坑` / `{dest} skip` | 过滤「必去但坑」叙事 |
| P3 片区（有 stay zone 后） | `{zone} 一日游` / `{zone} walking itinerary` | 与住宿区匹配，提高可行性 |
| F1 事实（Tavily） | `{dest} official tourism` + `include_domains` | L-fact，不与 UGC 混排权重 |

**动态加料（有 intel 时）**：

- 有 `confirmed stay zone` → 强制带入 P3，弱化跨城「打卡清单」笔记。  
- 有 outbound 抵达时刻偏晚 → query 或后处理提示「Day1 轻量」，减少乌托邦 Day1。  
- `preferences`（亲子/美食/徒步）→ 追加 1 条主题 query，替换通用 `itinerary`。

### 4.3 第二步：检索后过滤（降噪）

在进入 Prompt 前对 `EvidenceItem` 做规则过滤（无需 LLM）：

| 规则 | 作用 |
|------|------|
| 标题/snippet 含「机票优惠」「签证代办」「酒店折扣」且无行程词 → 降权或丢弃 | 去软广 |
| 与 destination 地名无任何重叠（简单别名表）→ 丢弃 | 防串城 |
| 同 `note_id`/`url` 去重；同域名超额截断 | 多样性 |
| TikHub 按 `likes` 排序但设上限（防单一网红垄断） | 模式多样 |
| `role=fact` 与 `role=pattern` 分桶后再合并（如 6 pattern + 3 fact） | 避免权威页被短视频标题挤掉 |

### 4.4 第三步：从 Evidence 抽「玩法候选」（结构化）

现状：把 title/snippet JSON 塞进 `UNTRUSTED_UGC`，靠主 LLM「自己看」。token 浪费且易忽略。

**建议增加轻量一步（可同步、可缓存）**：

```text
EvidenceItem[] 
  → extract_poi_candidates(dest)   # 小模型或规则+词典；输出 POI 名列表 + 提及次数
  → 写入 evidence 旁路结构 poi_tally
  → generate Prompt 增加「高频候选 POI」短表（仍标 UNTRUSTED）
```

成功标准：同一目的地多次生成，**高频 POI 稳定出现在行程节点名中**（可用字符串/归一化匹配统计）。

### 4.5 第四步：Places / Geocode 校验（WS-08 · 可行性关键）

[19 §8.3](./19-玩法印证与UGC数据源分析.md) 已写清：UGC 给语义候选，Places 给存在性。

```text
poi_tally 
  → Places/geocode 
  → 保留：存在 ∧ 类型合理 ∧（可选）rating/评分数门槛 ∧ 落在目的地围栏
  → generate 只优先安排「校验通过」集合
  → 未通过的可进 tips「网友常提但未核验」或直接丢弃
```

没有这一步，Evidence 再「像小红书」也会把假店/错坐标写进行程——**可行性不升反降**。

### 4.6 第五步：与机酒判决器合流（可行性收口）

印证不得覆盖 HARD CONSTRAINTS（现 Prompt 已声明）。实施上建议：

1. Evidence 只影响「玩法池」与 tips。  
2. Day1/末日/住宿半径仍由 [16 §6](./16-产品能力优先级纠偏分析.md) 类规则检查。  
3. UGC 与机酒冲突时：**改玩法，不改航班**。

---

## 5. 实施路线（分阶段，可停可测）

> 原则：每阶段有可测产物；不一次上 Agent-Reach 全家桶。

### Phase 0 — 对比脚本（1～2 天，先于接线）✅

**目的**：用数据决定「要不要接 Tavily / Exa」，避免感觉驱动。

| 交付 | 说明 | 状态 |
|------|------|------|
| `backend/scripts/bench_evidence_providers.py` | 多 provider → 同构 `EvidenceItem[]` | ✅ |
| `fixtures/evidence_bench_cases.yaml` | 大阪/新加坡等 case | ✅ |
| `.tmp/evidence_bench/*.json` + 简表 | 延迟、条数、域名分布、URL Jaccard、人工样例 | 本地跑脚本产出 |

**Providers（脚本内）**：

| id | 条件 | 映射 |
|----|------|------|
| `tikhub` | 已有 Key | 现 `build_evidence_pack` |
| `tavily` | 已有 Key | Search → EvidenceItem（`likes=null`, `source=tavily`） |
| `tavily_authority` | 同上 + domains 白名单 | `source=tavily_authority` |
| `exa` | 可选，有 Key 才跑 | `source=exa` |
| `agent_reach_xhs` | `--allow-cli` 且本机可用 | 仅对照，不进主链 |

**自动指标**：latency、error、去重后条数、域名占比、两两 Jaccard、金标 POI hit@k（每 case 手写 8～15 个必见点）。  
**人工指标**：是否像行程例子、广告占比、错城条数。

**判定表**：

| 结果 | 动作 |
|------|------|
| `tavily_authority` 对官方/规则类明显更好 | 启动 Phase 1 接 Tavily fact 桶 |
| Exa 与 Tavily Jaccard 高且 POI hit 无增益 | **不接 Exa** |
| Agent-Reach XHS ≈ TikHub | **不接 CLI**；改进 TikHub query 即可 |
| TikHub 广告噪音高 | Phase 1 先做过滤 + query，再谈新源 |

### Phase 1 — Query + 过滤 + Tavily fact（与现主链兼容）✅（缓存除外）

| ID | 工作 | 依赖 | 状态 |
|----|------|------|------|
| WS-05′ | 扩展 `evidence_queries`（日序/避坑/片区/偏好） | Phase 0 样例 | ✅ `tikhub.evidence_queries` |
| — | `filter_evidence_items` 降噪 | 无 | ✅ `filter_evidence.py` |
| WS-01/02′ | `tavily` authority → soft-merge 进 `fetch_evidence_pack` | Key 已有 | ✅ 可选；无 Key 跳过 |
| — | Prompt：分 `pattern` / `fact` 说明；仍 UNTRUSTED | 现 `_format_evidence_block` | ✅（authority source 标签） |
| **WS-CACHE** | 缓存 `(dest, days, zone, tags)` TTL（默认 7 天内存） | 控成本 | ✅ |

**不做**：Agent-Reach 生产依赖；换掉 TikHub。

### Phase 2 — POI 抽取 + 校验（可行性跃迁）

| ID | 工作 | 状态 |
|----|------|------|
| **WS-08a** | `extract_poi_candidates` → geocode 围栏轻量校验 → `meta.poi_candidates`；Prompt 注入高频已核验短表 | ✅ |
| **WS-CACHE** | EvidencePack 内存 TTL 缓存（降 TikHub 调用） | ✅ |
| **UX-EVD-01** | 面板「非官方」+ 已核验/仅网友 | ✅ |
| **WS-08b** | 完整 Places（类型/评分） | 🔲 有 Key/预算后再做 |

此阶段对「旅行玩法可行性」的增益通常 **大于再接一个搜索 API**。

### Phase 3 — 体验与飞轮（可选）

| 项 | 说明 |
|----|------|
| 用户粘贴 1～3 条笔记/链接 | TripPick 模式：人选题，系统结构化（[19 §8](./19-玩法印证与UGC数据源分析.md)） |
| 高频目的地弱缓存玩法卡 | 非完整 KB；仅缓存 `poi_tally` 人审过的版本 |
| Reddit 英文向 | 有稳定 API/合规路径再加 provider |
| Agent-Reach Skill | 仅开发者本机调研用，不进 CI/生产 |

---

## 6. 对比脚本大纲（按现有 EvidencePack 结构）

### 6.1 输出契约（与生产一致）

每条仍为：

```json
{
  "title": "...",
  "url": "https://...",
  "snippet": "...",
  "likes": 12345,
  "source": "tikhub_xhs",
  "query": "大阪 自由行 5天",
  "note_id": "..."
}
```

整次 bench 文件：

```json
{
  "case_id": "osaka_5d",
  "destination": "大阪",
  "day_count": 5,
  "queries": ["..."],
  "providers": {
    "tikhub": { "latency_ms": 0, "error": null, "items": [] },
    "tavily": { "latency_ms": 0, "error": null, "items": [] },
    "tavily_authority": { "latency_ms": 0, "error": null, "items": [] }
  },
  "metrics": {
    "jaccard": { "tikhub_tavily": 0.0 },
    "domain_share": {},
    "gold_poi_hit": { "tikhub": 0.0, "tavily": 0.0 }
  }
}
```

### 6.2 CLI 草案

```bash
python backend/scripts/bench_evidence_providers.py \
  --cases fixtures/evidence_bench_cases.yaml \
  --providers tikhub,tavily,tavily_authority \
  --out .tmp/evidence_bench/

# 可选本机对照（不默认）
python ... --providers tikhub,agent_reach_xhs --allow-cli
```

### 6.3 金标 POI（示例）

```yaml
# fixtures/evidence_bench_cases.yaml
cases:
  - id: osaka_5d
    destination: 大阪
    day_count: 5
    gold_pois: [心斋桥, 道顿堀, 大阪城, 环球影城, 梅田, 黑门市场, 奈良一日]
  - id: singapore_4d
    destination: 新加坡
    day_count: 4
    gold_pois: [滨海湾, 鱼尾狮, 圣淘沙, 牛车水, 小印度, 花园城市]
```

Hit 规则：`gold` 是否作为子串出现在任一 item 的 `title+snippet`（可再加别名表）。

---

## 7. 代码落点（实施时改哪里）

| 模块 | 现状 | 建议改动 |
|------|------|----------|
| `ugc/tikhub.py` | `EvidenceItem` + `build_evidence_pack` | 抽 `evidence_queries` 可配置；保留 normalize |
| `ugc/evidence_pack.py` | 仅 TikHub | `merge_providers(...)`；软失败仍 `[]` |
| 新建 `ugc/providers/tavily.py` | 无 | Search → EvidenceItem |
| `itinerary_llm._format_evidence_block` | 混注最多 12 条 | 按 role 分桶；可附 `poi_tally` 短表 |
| `scripts/bench_evidence_providers.py` | 无 | Phase 0 |
| 前端 `ItineraryEvidenceItem` | 已有 | 可选展示 `source` 分组；不必为大改 |

兼容策略：无 Tavily Key 时行为与今天完全一致（仅 TikHub）；TikHub 402/失败仍空 pack 降级。

---

## 8. 风险与诚实边界

| 风险 | 缓解 |
|------|------|
| UGC 高赞 ≠ 正确/可走 | Places 校验 + 机酒硬约束；Prompt 禁止编造赞数 |
| Tavily/网页乱价 | 继续禁止摘要入价（现已有） |
| TikHub 402/额度 | 已有软降级；缓存减调用 |
| Agent-Reach Cookie 封号 | 不进生产；个人调研用小号 |
| 检索拖慢 generate | 并行 fetch、TTL 缓存、超时短、失败跳过 |
| 用户以为「已对过小红书官方」 | UI 文案：公开网页/笔记参考，非平台官方数据 |

---

## 9. 成功度量（上线后看什么）

| 指标 | 定义 | 目标方向 |
|------|------|----------|
| Evidence 覆盖率 | generate 有 `meta.evidence.length > 0` 的比例 | 在 Key 正常时 ↑ |
| POI 印证率 | 行程节点名命中 evidence/poi_tally 的比例 | ↑ |
| 地理失败率 | geocode fence / needs_map_pick 警告 | ↓（WS-08 后更明显） |
| 机酒冲突警告 | Day1/末日违规 | 不因 Evidence 变差（应持平或 ↓） |
| 侧栏点击 | 用户打开参考链接 | 健康但非唯一 KPI |
| Bench 金标 hit@k | Phase 0 固定 case | 改 query/源后可回归对比 |

---

## 10. 决策清单（给产品/排期）

1. **采纳**：多 provider 扩展现有 EvidencePack；**不**整包引入 Agent-Reach；**不**另写印证系统。  
2. **成本**：**保留 TikHub** 作生产 pattern 主源；TTL 缓存 + 软降级控费；Reach 仅 bench（§0.1）。  
3. ~~**先做 Phase 0 bench**~~ ✅；Tavily authority 已 soft-merge。  
4. **下一步可行性主杠杆**：**WS-08a** 轻量 POI+geocode → 再议 **WS-08b** Places。  
5. **Exa / Agent-Reach**：默认仅评测；无显著增益则永久不做生产依赖。  
5. **与 16/18 优先级关系**：机酒与坐标仍优先；本方案是玩法层增强，不回退「先天气/大 Agent」。

### 10.1 实施落点（WS-09 / Phase 0–1）

| 产物 | 路径 |
|------|------|
| filter | `backend/app/services/ugc/filter_evidence.py` |
| Tavily provider | `backend/app/services/ugc/providers/tavily.py` |
| pack merge | `backend/app/services/ugc/evidence_pack.py` |
| query 分槽 | `backend/app/services/ugc/tikhub.py` → `evidence_queries` / `build_evidence_pack` |
| bench | `backend/scripts/bench_evidence_providers.py` + `backend/fixtures/evidence_bench_cases.yaml` |

---

## 11. 参考

- 上游：[Agent-Reach](https://github.com/Panniantong/Agent-Reach) · Exa MCP · Jina Reader  
- 本仓：[19](./19-玩法印证与UGC数据源分析.md) · [22 对话编排 / 印证显式步](./22-对话编排与玩法印证UX调研.md) · `backend/app/services/ugc/*` · `frontend/src/components/evidence/EvidencePanel.tsx`  
- 业界对照：Exa vs Tavily（语义发现 vs RAG 一次返回）；旅行 UGC 实践见 19 §8.2 TripPick / skills-travel-planner  

---

*文档版本：v1.1 · 2026-08-08 · Phase 0–1 / WS-09 落地*
