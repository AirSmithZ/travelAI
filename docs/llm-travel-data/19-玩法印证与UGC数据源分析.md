# 玩法可信度：联网印证与「旅行例子」数据源分析

← [18-机酒优先](./18-机酒优先与迭代行程产品决策.md) · [15-联网](./15-天气联网与决策Agent缺口分析.md) · [03-游玩](./03-游玩项目.md) · [TODO](./TODO.md)

> **日期**：2026-08-06 · **版本**：v1.0  
> **问题**：玩法判断是否已考虑联网？高赞帖/攻略能否作印证？网上旅行例子从哪取最好？

---

## 1. 现状：玩法 **没有** 考虑联网

| 层 | 现状 |
|----|------|
| `itineraries/generate` | 单次 LLM + `trip_request`（日后 + intel）；**无**检索上下文 |
| Tavily | Key 在 `.env`，**业务未接线**（见 15 · WS-*） |
| 产品纠偏 | 16 将天气/Tavily **整段暂缓**，优先 GEO + 机酒 |

因此当前玩法可信度 ≈ **模型参数记忆 + 用户表单**，没有「网上有人这么玩过」的外证。你提的印证需求 **合理，且是独立缺口**——与「机酒准 / 坐标准」正交：坐标对了仍可能编出冷门或过时玩法。

---

## 2. 「印证」该做什么、不该做什么

### 2.1 建议产品定义

**印证 ≠ 把小红书高赞原文抄成行程。**  
**印证 =** 生成前检索少量公开来源 → 注入 Prompt 作约束/启发 → UI 展示「参考依据」链接（用户自点，不自动打开）。

| 用途 | 要 | 不要 |
|------|----|------|
| 验证「这些 POI / 日序是否常见」 | ✅ | 把点赞数当客观真理 |
| 补充 tips（避开周一闭馆、热门时段） | ✅ | 从摘要里摘票价当可订价 |
| 提升用户信任（看得见出处） | ✅ | 无出处却写「根据高赞攻略」 |
| 直接当唯一排程算法 | ❌ | 爬虫整站当主库（合规/稳定性差） |

### 2.2 可信度应分三层（不要混）

```text
L-geo   点在哪          → Geocode / Places（已有主线 GEO）
L-fact  开放/预约/规则  → 官方站 + Tavily 定向核验
L-pattern 怎么排日子    → 公开游记/攻略/社区帖「例子」印证  ← 本文焦点
L-price 多少钱          → Ignav / OTA / 深链（禁止网页摘要当价）
```

高赞帖主要服务 **L-pattern**（节奏、组合、避坑），偶尔带 **L-fact**；**不能**替代 L-geo / L-price。

---

## 3. 「网上旅行例子」候选源对比

面向：境外（尤其亚太）+ 中文用户心智 + 可工程化。

| 源 | 像不像「高赞例子」 | 可工程获取 | 内容质量 | 合规/风险 | Phase 建议 |
|----|-------------------|------------|----------|-----------|------------|
| **Tavily 通用检索**（已有 Key） | 间接：搜到的是公开索引页 | ✅ REST | 中～高（看 query） | 低（合法检索 API） | **Phase 1 主通道** |
| **域名白名单检索**（旅游局、Wikivoyage、Timeout、官方景点） | 偏「权威例子」非高赞 | ✅ Tavily `include_domains` | 高（事实） | 低 | **与 Phase 1 同开** |
| **Reddit**（r/travel、目的地 sub） | 英文高赞讨论多 | ✅ 经 Tavily 或 Reddit API | 行程结构好 | 中（ToS/归因） | Phase 1.5 英文向 |
| **Google Places rating/reviews** | 单 POI 口碑，不是整趟例子 | ✅ Places API | 点级可信 | 需计费 | POI 卡片增强，非整行程 |
| **Trip.com / Klook 景点+点评** | 平台内「热门」 | ⚠️ Partner/爬虫 | 亚太好 | Partner 优于爬 | 有合作再接 |
| **Wikivoyage / Wikimedia** | 经典「一日游」段落 | ✅ 开放内容 | 稳、偏旧 | 低（注意许可） | 好 KB 种子 |
| **中文博客 / 知乎专栏**（公开页） | 接近游记例子 | ✅ 经 Tavily | 参差 | 低～中（勿整篇搬运） | Phase 1 可命中 |
| **小红书 / 抖音** | **最贴你说的高赞** | ❌ 无稳定正规第三方 API | 高赞≠正确 | **高**（反爬、ToS、搬运） | **不做主源**；用户可自行对照 |
| **马蜂窝 / 穷游游记** | 经典中文行程例子 | ❌ 基本靠爬 | 结构完整但老化 | 高 | 不建议生产主源 |
| **自建「目的地玩法卡」KB** | 你们策展的「认证例子」 | ✅ YAML/CMS | 可控 | 低 | Phase 2 质量飞轮 |

### 3.1 结论：从哪取最好？

| 优先级 | 怎么取 | 为什么 |
|--------|--------|--------|
| **P0 工程主源** | **Tavily Search + Extract**，固定 query 模板 + **权威域名加权/白名单** | Key 已有；有 URL 可引用；不绑单一社交平台；可控成本 |
| **P0 展示** | 每条依据保留 `title/url/snippet`，行程侧栏「参考 N 条」 | 满足「可信度」；深链用户自开 |
| **P1 点级口碑** | Google Places（rating + user_ratings_total）挂在节点上 | 「这家店靠谱」≠「这趟行程靠谱」，但互补 |
| **P2 质量飞轮** | 高频目的地沉淀 **玩法卡 KB**（人审过的日序模板） | 比每次赌搜索结果稳；仍可用检索增量刷新 |
| **明确不做主源** | 小红书/抖音/马蜂窝整站爬「高赞」 | 产品心智对、工程与合规不对 |

**中文「高赞」心智的务实替代**：用 Tavily 查  
`{城市} 自由行 行程 天数` / `{城市} itinerary days`，再 **强制要求模型只从注入的 snippets 里选 POI 组合**，并在 UI 写「参考公开网页，非小红书官方数据」。若未来有正规内容合作再贴平台名。

---

## 4. 推荐接入形态（与机酒优先兼容）

不恢复「草图两轮玩法」；在 **机酒确认之后、精排之前** 加一步轻量检索：

```text
表单 + travel_intel（机酒）
  → EvidencePack = Tavily(有限 query，如 2～4 次)
  → generate(trip_request + intel + EvidencePack)
  → itinerary + meta.evidence[]（URL 列表）
```

### 4.1 Query 模板示例（单城 5 天）

1. `{dest} {n}-day itinerary` / `{dest} 自由行 {n}天 行程`  
2. `{dest} must see vs skip` / 避坑  
3. （可选）`{dest} official tourism` 限 `*.gov` / 旅游局域  
4. （有片区后）`{zone} things to do walking`

**预算**：每趟精排 ≤ N 次 search（如 3）+ 可选 1 次 extract 长文；结果缓存按 `(dest, day_count, lang)` TTL 7～30 天。

### 4.2 Prompt 契约（防「假装读过网」）

- 必须：优先安排 EvidencePack 中反复出现的 POI；冲突时以 **机酒时刻** 为准。  
- 禁止：编造「小红书 10w 赞」类数字；无 URL 不得写具体出处。  
- 允许：在 `tips` / `meta.evidence` 列出 2～5 条参考链接。  
- 票价/酒店价：仍禁止从网页摘要写入。

### 4.3 与 15 / 18 的优先级关系

| 能力 | 相对顺序 |
|------|----------|
| GEO + B-P4 机酒硬约束 | 仍先做（错点上印证无意义） |
| **玩法 EvidencePack（本文）** | GEO 基本可用后 **应重启**，不必等完整 Planner |
| 天气和风 | 仍可后于印证（对「例子可信度」帮助更小） |
| 小红书级 UGC | 无合规通道则不做 |

---

## 5. 风险与诚实表述

| 风险 | 缓解 |
|------|------|
| SEO 垃圾站 / AI 垃圾攻略 | 域名白名单 + 多源交叉（同 POI ≥2 源再升权） |
| 过时行程（已闭园） | snippets 带日期；事实类再跑一条官方 query；节点可标 `evidence_weak` |
| 版权 | 只注入摘要 + 链出，不整篇转载 |
| 用户以为「已帮我对过小红书」 | UI 文案写清来源类型 |

---

## 6. 待办映射（建议新增）

| ID | 内容 | 优先级 |
|----|------|--------|
| **WS-01** | Tavily REST 客户端（已有） | P1 → 上调与玩法绑定后为 **P0′**（次于 GEO） |
| **WS-04**（新） | generate 前组装 `EvidencePack` + `meta.evidence[]` | ✅ |
| **WS-05**（新） | 目的地 query 模板 + `include_domains` 配置 | P1 |
| **WS-06**（新） | 前端「参考依据」列表（不自动打开） | ✅ `EvidencePanel` + `leftPanelMode: evidence` |
| **ACT-KB-01** | 高频城玩法卡人审 KB | P2 |

---

## 7. Google Places：能拿到什么？够不够判断「符不符合本次旅行」？

### 7.1 能拿到（个人项目：开 GCP Places API New + 计费账号即可）

本仓库 **尚未接线**；能力上 Text Search / Place Details 可要字段包括：

| 字段类 | 例子 | 对「符不符合旅行」的用处 |
|--------|------|--------------------------|
| 身份 | `displayName`、`formattedAddress`、`location` | 是什么店、在哪 |
| 类型 | `types` / `primaryType`（museum、park、restaurant…） | **比裸评分重要**：可对齐 preference_tags |
| 口碑 | `rating`、`userRatingCount` | 热度/口碑过滤（建议同时看评价数） |
| 摘要 | `editorialSummary`、`generativeSummary`、`reviewSummary` | 短描述，给 LLM 判断氛围 |
| 评论 | `reviews`（通常少量） | 文本信号，非完整高赞帖 |
| 其它 | `priceLevel`、营业时间、`websiteUri` | 预算档、是否当天可去 |

所以：**不是「只能拿到一个分数」**；类型 + 摘要 + 少量评论，再交给 LLM 对照「亲子 / 美食 / 徒步」等，**可以做点级筛选**。

### 7.2 仍然不够的地方（你的直觉对）

| Places 擅长 | Places 不擅长 |
|-------------|----------------|
| 「滨海湾金沙是什么、评分如何」 | 「5 天新加坡怎么排才像高赞游记」 |
| 候选 POI 去垃圾店 | 日序、通勤节奏、避坑组合 |
| 校验 LLM 瞎编的店名是否存在 | 中文社区「本季流行玩法」 |

结论：**Places = 点级校验层**；**行程例子仍要 UGC/检索层**。两者叠加才合理，不是二选一。

---

## 8. 个人项目路径（不建 KB · 合规自担）

> 用户决策：不建自研玩法 KB；个人项目可接受更高风险的 UGC 抓取；希望找 GitHub / Skill。

不建 KB **合理**：个人维护成本 > 收益；用 **每次精排即时检索**（EvidencePack）即可，质量上限跟线上平台走。

合规：即使个人用，仍可能面对 **封号 / 接口失效 / 不稳定**；下文按「工程可维护性」排序，不展开法律意见。

### 8.1 推荐信息获取栈（由稳到「像小红书」）

| 序 | 方案 | 得到什么 | 维护成本 | 备注 |
|----|------|----------|----------|------|
| 1 | **Tavily**（已有 Key）± `site:xiaohongshu.com` | 公开索引到的笔记摘要 + URL | 低 | 覆盖不全，但零接入成本 |
| 2 | **TikHub 类第三方 API**（多项目在用） | 小红书搜索/正文/点赞等结构化 | 中（付费） | 比自签稳；[skills-travel-planner](https://github.com/huanyuzhilv/skills-travel-planner) 走这条 |
| 3 | **Apify Actor**（如 rednote scraper） | 按赞过滤的笔记列表 | 中（按次付费） | 托管反爬，适合个人 |
| 4 | **GitHub 自建 xhs 库** | 直连接口 | **高**（签名常挂） | 仅当愿意持续修 |
| 5 | **用户粘贴链接/文案**（TripPick 模式） | 用户选定的「可信帖」 | 最低 | 最稳产品形态：人选题，系统结构化 |

**建议组合（个人项目）**：

```text
（主）用户粘贴 1～3 条小红书/游记链接或全文
  +（辅）Tavily / TikHub 按「{城} {天数} 自由行」搜高赞摘要
  → LLM 抽 POI / 日序候选
  →（可选）Places：校验存在 + types + rating
  → 再硬吃机酒精排
```

不建 KB；缓存最多做「同城同天数 TTL」减少重复扣费即可。

### 8.1.1 TikHub 已选作 UGC 主 API（2026-08-07）

| 项 | 值 |
|----|-----|
| 控制台 | [user.tikhub.io/dashboard/ai](https://user.tikhub.io/dashboard/ai) |
| API 文档 | [api.tikhub.io](https://api.tikhub.io) · [docs.tikhub.io](https://docs.tikhub.io) |
| Base | `https://api.tikhub.io` |
| 认证 | `Authorization: Bearer $TIKHUB_API_KEY` |
| 搜笔记（推荐 App V2） | `GET /api/v1/xiaohongshu/app_v2/search_notes`（`sort_type=popularity_descending` ≈ 高赞） |
| 配置 | 根目录 `.env`：`TIKHUB_API_KEY` / `TIKHUB_API_BASE`（**已 gitignore**）；模板见 `.env.example` |
| 代码 | ✅ `backend/app/services/ugc/tikhub.py` · `evidence_pack.py` · generate 注入 · `POST /api/v1/ugc/evidence/preview` |
| 联调 | `python backend/scripts/test_tikhub_evidence.py`；preview 若 **402** 则为 TikHub 余额/套餐问题 |

**安全**：登录密码**禁止**写入 `.env` / 文档 / git。若 Key 曾出现在聊天记录，请在控制台**轮换 API Key** 并改密。

### 8.2 可参考的 GitHub / Skill（调研 2026-08）

| 项目 | 类型 | 可借鉴点 |
|------|------|----------|
| [zjgttz/trippick](https://github.com/zjgttz/trippick) | 完整 Next 应用 | **粘贴小红书 → 清洗/抓取 → LLM 结构化 → 人勾选 POI**；决策权在人 |
| [huanyuzhilv/skills-travel-planner](https://github.com/huanyuzhilv/skills-travel-planner) | Cursor/Claude **Skill** | TikHub 拉小红书；路书 JSON→HTML；可当 Agent 侧技能参考 |
| [tianxingyang/skills-travel-planner](https://github.com/tianxingyang/skills-travel-planner) | Skill | 多源搜索（含小红书 MCP / `site:` 回退）生成行程 HTML |
| [Ryanuppp/On-The-Road](https://github.com/Ryanuppp/On-The-Road) | MCP + Skill 工具链 | 小红书搜索 MCP + 地图排路；星数少，作思路参考 |
| Apify `*xiaohongshu*` / `rednote*` Actors | 托管爬虫 | `filterByMinLikes` 贴近「高赞」 |
| 开源 `xhs` / `xhs-api` 等 | Python 库 | 需看 **最近 commit**；停更即废 |

本仓库现有 skills（`ai-chat-ui`、`llm-api-engineering` 等）**不含**小红书采集；若要固化流程，可另装/自写 skill：`xhs-evidence-pack`（触发词：印证、小红书、EvidencePack）。

### 8.3 和 Places 怎么配合（回答「光有评分不好判断」）

1. UGC 先给出「候选玩法 / POI 列表」（有语义、有场景）。  
2. Places（或现有 geocode）做：**是否真实存在、类型是否对、评分/评价数门槛、坐标**。  
3. LLM 只在「UGC 候选 ∩ Places 校验通过」里排日序，并服从机酒。  

单独 Places 评分排序 → 容易变成「热门景点清单」，**不符合「像帖子一样的旅行要求」**；单独 UGC 不校验 → 假店/错坐标。个人项目也应保留这层校验（Places 或至少 geocode）。

---

## 9. 一句话答

- **现在玩法没有联网。**  
- **Places 评分能拿到，且不止评分（类型/摘要/少量评论）——适合点级过滤，不适合当整趟玩法例子。**  
- **个人项目可不建 KB；印证用即时 UGC/检索。**  
- **工程上优先：粘贴链接 + Tavily/TikHub/Apify；GitHub Skill 可参考 TripPick / skills-travel-planner。**  
- **机酒与坐标仍优先；印证接在精排前。**

---

*文档版本：v1.1 · 2026-08-06*
