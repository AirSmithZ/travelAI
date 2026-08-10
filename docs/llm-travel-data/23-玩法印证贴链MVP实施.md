# 23 · 玩法印证贴链 MVP 实施

← [19-UGC](./19-玩法印证与UGC数据源分析.md) · [21-多源](./21-Agent-Reach与玩法印证多源实施调研.md) · [22-UX](./22-对话编排与玩法印证UX调研.md) · [TODO](./TODO.md)

> 状态：**✅ MVP 已实施**（2026-08-09）  
> Skill：`llm-api-engineering`（generate 注入 / soft-fail）· 前端沿用 EvidencePanel 既有视觉语言

---

## 1. 目标

| 项 | 约定 |
|----|------|
| 多链接 | 面板可粘贴多条（上限 5） |
| 独立模块 | 每条链接一张卡；卡内有「检索」与结果区 |
| 检索内容 | TikHub 拉核心字段（标题/正文摘要/赞），**不做**卡内全文 LLM 分析 |
| LLM 权重 | `HARD(机酒) > 用户已检索笔记 > 最初玩法提示词 > 自动搜` |
| 多链冲突 | MVP 交给 LLM + 显式取舍规则；事实类不采信 UGC |
| 扩展 | Provider 路由；后续抖音/网页只加 provider |

---

## 2. 架构

```text
EvidencePanel 模块卡
  → POST /api/v1/ugc/evidence/from-link { url, destination? }
  → LinkProvider 路由（MVP: Xhs）
  → TikHub get_image/video_note_detail（付费路由）
  → 若 402/空 → Tavily Extract 降级（xhslink.cn 短链可用）
  → EvidenceItem (user_paste_xhs | user_paste_tavily)
  → 卡内展示

generate
  → body.user_evidence[]（仅 status=ok 的模块）
  → 与自动 EvidencePack 合并（用户在前）
  → _format_evidence_block 优先注入 USER_SELECTED_UGC
```

---

## 3. API / Schema

### 3.1 `POST /api/v1/ugc/evidence/from-link`

```json
// req
{ "url": "https://xhslink.com/...", "destination": "奥克兰" }

// res
{
  "ok": true,
  "item": {
    "title": "...",
    "url": "https://www.xiaohongshu.com/explore/...",
    "snippet": "...",
    "likes": 12000,
    "source": "user_paste_xhs",
    "note_id": "..."
  },
  "error": null,
  "provider": "xhs_tikhub"
}
```

Soft-fail：未配置 Key / 非支持域名 / 上游失败 → `ok:false` + 可读 `error`。

**前端缓存**：`evidenceLinkCache`（localStorage · TTL 7 天 · 同 URL 规范化键）——调用 `from-link` 前命中则跳过网络。

### 3.2 Generate

`GenerateItineraryRequest.user_evidence: list[dict]`（可选）  
仅前端已检索成功的条目；未点检索的 URL **不发送**。

---

## 4. 前端状态

`TravelPlan.evidence_link_modules: EvidenceLinkModule[]`

```ts
{
  id, url,
  status: 'idle' | 'loading' | 'ok' | 'error',
  error?, fetchedAt?,
  result?: ItineraryEvidenceItem  // 展示与注入以此为准
}
```

动作：`addEvidenceLink` · `removeEvidenceLink` · `fetchEvidenceLink(id)` · `updateEvidenceLinkUrl`

---

## 5. Prompt 优先级与冲突

```text
1. HARD CONSTRAINTS（机酒/日期）
2. USER_SELECTED_UGC（用户贴链已检索）— 高于 free_text / preference_tags 的玩法偏好
3. 用户最初提示词 / preference
4. 自动检索公开笔记（补齐）
```

冲突规则（写入 prompt）：
- 多条用户笔记玩法冲突 → 优先共同提及；其余分日或次选；禁止同一天硬塞互斥行程
- 无法调和 → `meta.warnings` 简述取舍
- 价格/营业时间不以笔记为准

---

## 6. Provider 扩展

```python
# link_providers.py
class EvidenceLinkProvider(Protocol):
    name: str
    def can_handle(self, url: str) -> bool: ...
    def fetch(self, url: str, *, settings, destination) -> EvidenceItem: ...
```

| 平台 | Provider | MVP |
|------|----------|-----|
| 小红书 | `XhsTikHubProvider` | ✅ |
| 抖音等 | 新 Provider + 注册 | 后续 |
| 普通网页 | Tavily extract | 后续 |

---

## 7. 文件落点

| 层 | 路径 |
|----|------|
| 实施本文 | `docs/llm-travel-data/23-玩法印证贴链MVP实施.md` |
| Provider | `backend/app/services/ugc/link_providers.py` |
| TikHub 详情 | `backend/app/services/ugc/tikhub.py` |
| API | `backend/app/api/v1/ugc.py` |
| Generate | `schemas/itinerary.py` · `itinerary_llm.py` · `itineraries.py` |
| FE | `api/evidence.ts` · `EvidencePanel.*` · `usePlanStore` · `types/travelPlan` |
| 测试 | `backend/scripts/test_evidence_from_link.py` |

---

## 8. 验收

1. 可贴 ≥2 条链接，各成独立卡片  
2. 每卡「检索」；loading / 正文 / 错误在本卡内  
3. 未检索链接不进 LLM  
4. ≥1 条检索成功时，prompt 以用户笔记为主且高于 free_text 玩法偏好  
5. TikHub 未配置时卡内明确提示  

---

## 9. 非目标（本 MVP）

- 卡内 LLM「玩法分析」  
- 粘贴后自动批量检索  
- 抖音 / 网页 extract  
- 人勾选「采纳」开关（后续可选）

---

*文档版本：v1.0 · 2026-08-09*
