# 32 · 住宿粗推多片区 · 机酒状态 Tag

← [12-片区倒推](./12-阶段B住宿区域倒推方案.md) · [33-提示词主题Tag](./33-提示词主题Tag分析.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.4  
> **说明**：本波落地的是 **`fit_tag`（当前锚点/需换城等）**，用于机酒冲突门禁（卡上次要）。  
> 用户要的 **提示词关键词主题 tag（海边/人文…）** 见 **[33](./33-提示词主题Tag分析.md)**（`HOT-THEME-TAG` ✅），勿与本文件混用。  
> **v1.4**：`bookable` 同城锚优先 **航班抵达城**（SGN→胡志明），避免 destination=「越南」误杀城内片区。

---

## 0. Skill 选型

| Skill | 用途 |
|-------|------|
| **llm-api-engineering** | 多 zone JSON；`fit_tag`/`bookable` **规则后置覆盖** |
| **ai-chat-ui** | 卡顶 tag；需换城不可确认；引导对话改目的地 |

---

## 1. 已落地

| 项 | 落点 |
|----|------|
| Tag 契约 | `current_anchor` / `preference_fit` / `compromise` / `needs_city_change` |
| 规则层 | `zone_tags.py`：同城判定、海边关键词、越南轻量备选表；**bookable 锚 = 航班抵达城优先于 destination** |
| Prompt | 要求 2～4 zones，必含锚点；偏好冲突给换城备选 |
| UI | StayZonePanel：`fit_tag` **次要**；主题 tag 见 [33](./33-提示词主题Tag分析.md)；`!bookable` 无确认/搜店，有「去对话改目的地」 |
| 门禁 | store `confirmStayZone` 拒绝需换城 |

```bash
cd backend && python scripts/test_zone_tags.py
```

**验收示例**：

- destination=胡志明 + 海边 → 第一郡「当前锚点」+ 芽庄/岘港「需换城」
- destination=**越南** + 航班 TFU→**SGN** → 胡志明城内片区 **可锁**；头顿/芽庄仍「需换城」

---

*本波完成 · 可后续扩更多偏好主题表*
