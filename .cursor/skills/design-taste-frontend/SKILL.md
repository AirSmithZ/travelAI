---
name: design-taste-frontend
description: Applies refined visual taste and editorial-quality frontend design—typography, spacing, color restraint, and anti-slop curation. Use when polishing UI aesthetics, reviewing design quality, choosing fonts/palettes, or when the user asks for design taste, visual refinement, or non-generic interfaces.
---

# Design Taste Frontend

**Taste = 克制 + 一致 + 有意图。** 与 `frontend-design`（大胆方向探索）互补：本 skill 侧重**打磨、策展、拒绝廉价感**。

## 何时使用

- UI 「能看但不够好」需要精修
- 选择字体、色板、间距体系
- 审查界面是否落入 AI 审美陷阱
- 旅游/信息图类产品需要**编辑感**而非 SaaS 模板感

## 品味三原则

1. **一个主锚点**：一个 display 字体 OR 一个 accent 色 OR 一个布局破格——不要三者同时抢戏
2. **节奏胜于装饰**：8px 网格、行高 1.5–1.65、区块间距成比例（4:6:8）
3. **信息优先**：旅行规划 = 时间、地点、路线清晰；特效不得遮挡内容

## 字体

| 层级 | 建议 |
|------|------|
| Display | 有性格：Syne、Instrument Serif、DM Serif Display、Noto Serif SC |
| Body | 可读：Noto Sans SC、Source Han Sans、IBM Plex Sans |
| 数据/时间 | `font-variant-numeric: tabular-nums` |

**避免**：Inter、Roboto、Arial、Space Grotesk（过度使用）、同一页面超过 2 个 family。

## 色彩

- 深色产品：背景至少两层（`#070b10` / `#0c1219` / `#131b24`），不要纯 `#000`
- Accent **一个**：琥珀 `#f59e0b`、珊瑚、青绿——占界面 < 5% 面积
- 文本三级：`text` / `muted` / `dim`，对比度 WCAG AA
- 边框用 `rgba(148,163,184,0.12)` 而非实色灰线

## 间距与圆角

```css
/* 本项目已有变量，优先复用 */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 18px;
```

- 卡片内边距 ≥ 12px；区块间距 ≥ 16px
- 同类组件圆角统一，不要按钮 4px、卡片 18px、输入 8px 混用无规律

##  motion

- 页面切换：200–300ms，`opacity` + 轻微 `translateY(8px)`
- **不要**：到处 bounce、无限循环动画、视差滚动干扰阅读
- 路线图/地图：仅在选中、切换 Tab 时过渡

## 旅行产品特化

- **路线图节点**：类别色一致（见 `categoryTokens.ts`），选中用 accent 描边而非整块变色
- **总览模式**：区域轨字号 11px、右对齐、低饱和；日期列头用 display 字体
- **地图 Marker**：标签可截断，选中放大 ≤ 1.15x
- **空状态**：一句标题 + 一句说明，插画/图标单一符号即可

## 廉价感检查清单（提交前）

- [ ] 是否紫色渐变 + 白底？
- [ ] 是否满屏居中 Hero + 大圆角卡片三件套？
- [ ] 是否 emoji 当图标且无统一尺寸？
- [ ] 是否阴影过重（`box-shadow: 0 25px 50px` 到处用）？
- [ ] 是否中英文混排无间距（如 `Day1周一`）？
- [ ] 是否 contrast 不足的中灰字 on 深灰底？

## 与 frontend-design 的分工

| Skill | 侧重 |
|-------|------|
| `frontend-design` | 选定大胆方向，从零搭建有个性界面 |
| `design-taste-frontend` | 在已有界面上策展、统一、去油腻 |

两者可同时读：先 direction，再 taste pass。

## 参考

- 本项目样式：[`frontend/src/styles/globals.css`](../../../frontend/src/styles/globals.css)
- 参考图：`map.png`（信息图密度与区域分区）
