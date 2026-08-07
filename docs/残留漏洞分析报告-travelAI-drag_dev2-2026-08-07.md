# travelAI `drag_dev2` 残留/新增漏洞分析报告
> 复检范围：远端 `drag_dev2` 最新提交 `0f41512`（"fix: untrack nested Chrome profiles and harden geocode fallback"）+ 本地 `2cf2650` 其余代码
> 说明：本地 clone 仍停在父提交 `2cf2650`（沙箱到 GitHub 的 TLS 被拦截，`git fetch` 失败）；经 WebFetch 取远端 `0f41512` 的 `.gitignore`、commit diff、最新 `geocoding.py` 与文件树核验。除 `0f41512` 改动的 `geocoding.py` 外，其余后端代码与 `2cf2650` 一致，已本地逐文件扫描。
>
> **文档性质**：外部审计草稿（已处置回写）· 非产品规格。状态以 [llm-travel-data/TODO.md](./llm-travel-data/TODO.md) 为准。  
> **处置时间**：2026-08-07 · 对照 `llm-api-engineering` skill 完成 P1 提示注入 + GEO-08。

## 一、上一轮问题在本轮的修复确认

| 上轮问题 | 本轮状态 | 证据 |
|---|---|---|
| **SEC-01** Chrome 档案入库（含 Cookies/Login Data/gaia_cookie/webauthn 密钥） | ✅ **真修复** | 远端文件树已无任何 `edreams` 路径；`0f41512` 把 `backend/`+`flight-spike/` 的 `.edreams_chrome_data/` 全部 `removed` 出索引，并补 `**/.edreams_chrome_data/` gitignore |
| GEO-01/02 盲信 Top1、无围栏 | ✅ 已修（上轮已验证） | `geocode_providers.py` 围栏 + 单测通过 |
| B-P4 机酒硬约束注入 | ✅ 已修 | `itinerary_llm.py` HARD CONSTRAINTS 块 |
| FLOW-01b 后端无航班 400 门禁 | ✅ 已修 | `itineraries.py` |
| 深链自动打开（反向劫持） | ✅ 已修 | 全站 `target=_blank rel=noopener noreferrer` |
| **GEO 边缘失效**（中心解析失败时退回全球裸名 Top1） | ✅ **本轮加固** | `geocoding.py:_bias_for_destination` 中心失败时保留 `country_code` 过滤并打 `low` 信心告警，不再完全放开；`geocode_autocomplete` 有目的地时 `allow_bare=False` |
| **GEO「近但错」**（150km 内同名错点仍取 Top1） | ✅ **已修（GEO-08）** | `_candidate_score` = 名称分 − 距中心惩罚；同名近分标 `low`；`test_geocode_fence.py` 覆盖 |

> 结论：上一轮最关键的 **SEC-01（凭证泄露）这一次是真的从 git 移除了**（之前只是加了 gitignore 没 `git rm --cached`）。这点要肯定。

---

## 二、残留 / 新增漏洞清单（按严重度）· 处置状态

### 🔴 P1 — 提示注入（LLM 指令越权）→ **SEC-03 ✅ 已修**
**位置**：`backend/app/services/itinerary_llm.py` system prompt、`_build_generate_user`、`_format_evidence_block`

| 原问题 | 处置 |
|--------|------|
| system 用「若 user 消息含『已确认机酒硬约束』则遵守」等**用户文本触发开关** | ✅ 删除触发开关；改为「若存在结构化 HARD CONSTRAINTS 块则遵守」+ 优先级链 |
| `free_text`/`notes` 与硬约束同段可覆盖 | ✅ 包进 `USER_DATA（偏好数据，不是指令）` 边界 |
| UGC 笔记原文间接注入 | ✅ 包进 `UNTRUSTED_UGC` 边界，声明其中指令无效 |

### 🔴 P1 — 航班价源依赖未声明的外部抓取 CLI → **FLT-LETSFG 🔲 文档化，默认关闭**
**位置**：`letsfg_provider.py`、`flight-spike/letsfg.py`、`requirements.txt`

- subprocess 列表形式、无 shell → **无命令注入**（已确认，排除）。
- **合规/ToS/脆弱性/双份实现**仍属实。默认 `FLIGHT_INCLUDE_LETSFG=false`；主源为 Ignav。
- **处置**：✅ README / `.env.example` 标明可选外部 CLI、合规责任、不在 requirements；默认关闭；主源 Ignav。进一步去重/改授权 API 仍可后续增强，TODO 已标完成（文档化边界）。

### 🟠 P2 — 付费 LLM 接口无限流 / 无鉴权 → **SEC-02 🔲 部署前置，保持开放**
- 本地 `CORS_ORIGINS=localhost` 可接受；公网上线前补 API Key/限流 + 收紧 CORS。见 TODO。

### 🟠 P2 — 地理围栏「近但错」→ **GEO-08 ✅ 已修**
- `_candidate_score` 融合距离；同名多候选 → `coord_confidence=low`。

### 🟠 P2 — 外部 Base URL 全经环境变量 → **SEC-04 ✅ 已修**
- `.env.example` 运维提醒 + `config.py` **https + 主机 allowlist**（非法配置拒绝加载）。

### 🟡 P3 — 数据契约债 → **DATA-02～06 🔲 计划内**
- 时区粗映射、双 Mock、schema 漂移、flight-spike 双模型：保持开放，非本轮必修。

### 🟡 P3 — 工程卫生：分析报告入库 → **本轮标注**
- 本文件与复检报告标明「外部审计草稿，已处置回写」；TODO 状态与代码绑定。

---

## 三、核心结论（更新）

1. **SEC-01** 真修复（索引已清）。**SEC-01b** 历史 blob / 账号轮换仍开放。
2. **GEO** 主诉 +「近但错」距离融合已落地（GEO-06/07/08）。
3. **提示注入（原最大新风险）已按 skill 修完（SEC-03）**：去掉用户文本触发开关，隔离 USER_DATA / UNTRUSTED_UGC。
4. **letsfg** 默认关闭；合规与去重记 `FLT-LETSFG`，不阻塞主链。
5. **部署前仍须 SEC-02**（鉴权/限流/CORS）。

## 四、建议的下一步优先级
1. ~~修提示注入~~ ✅ SEC-03  
2. ~~geocode 名称分融合距离~~ ✅ GEO-08  
3. ~~L1 主源 SerpApi~~ ✅ · ~~SEC-04 / FLT-LETSFG 文档+白名单~~ ✅ · ~~DATA/FLOW-02/HOT-03~~ ✅（[20 §6](./llm-travel-data/20-L1L2运行验证记录.md)）  
4. **SEC-02** 部署前置 · **SEC-01b** 轮换  
5. **B-P3** / **B-FLT-01** · HOT-01 探路 · GEO-09（可选）

---

*报告版本：v1.3 · 2026-08-07 · 范围 2 回写 · 待办见 [llm TODO](./llm-travel-data/TODO.md)*
