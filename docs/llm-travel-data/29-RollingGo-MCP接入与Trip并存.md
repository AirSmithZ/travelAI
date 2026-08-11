# 29 · RollingGo MCP 接入 · 与 Trip 并存

← [26-Trip降级](./26-SerpAPI额度不足与Trip片区优先降级分析.md) · [02-酒店](./02-酒店信息.md) · [TODO](./TODO.md)

> **日期**：2026-08-10 · **版本**：v1.1  
> **性质**：探路 + **HOT-RG-02 App lodging 已落地**（见 [31](./31-RollingGo-lodging接入与地图钉实施.md)）  
> **待办**：`HOT-RG-01` ✅ · `HOT-RG-02` ✅

---

## 0. 结论

| # | 结论 |
|---|------|
| 1 | Cursor MCP 探通与后端共用同一端点/Key：`searchHotels`。 |
| 2 | **与 Trip 不冲突**：Trip = 成交/浏览出口；RollingGo = 结构化搜店与参考价钉。 |
| 3 | App lodging 优先链：**RollingGo →（可选 Serp）→ Trip CTA**（Serp 默认关）。 |
| 4 | 完整订房 / OAuth 仍商务后续。 |

---

## 1. MCP vs Skill

| | MCP（本波） | Skill（`rollinggo-hotel-booking`） |
|--|------------|-------------------------------------|
| 接入 | `.cursor/mcp.json` → `https://mcp.rollinggo.cn/mcp` | `rgh` CLI + OAuth/`login` |
| 搜店 | Key 即可 | 可能还需登录链路 |
| 订房 | 免费档偏搜+详情；完整订房要商务 OAuth | Agent 内锁价/下单 |
| 产品复用 | 同一 HTTP JSON-RPC 可进 FastAPI | 绑 Cursor Agent，难进 lodging API |

已装 Skill 目录可保留；**Agent 优先走 MCP**。

---

## 2. 与 Trip / Serp 分层

```text
片区推荐 / 地图轮廓（App）
    ├─ Trip 深链     → 用户去 OTA 浏览/下单（主成交 CTA）
    ├─ RollingGo     → 结构化候选钉 + 参考价（HOT-RG-02）
    └─ Serp lodging  → 可选增强（`LODGING_ENABLE_SERP=true`）
锁店 → travel_intel.hotels → 玩法精排
```

**文案原则**：RollingGo 价标「参考价」；主下单 CTA 可仍用 Trip；若展示 RollingGo `bookingUrl` 须标明渠道，勿与 Trip 混成「同一家同一价」。

---

## 3. 本机配置（已落地）

| 项 | 位置 |
|----|------|
| Key | `.env` → `ROLLINGGO_MCP_API_KEY`（gitignore） |
| 模板 | `.env.example` 占位 |
| MCP 示例 | `.cursor/mcp.json.example`（`${env:ROLLINGGO_MCP_API_KEY}`，可提交） |
| MCP 本地 | `.cursor/mcp.json`（Bearer 真 Key，**gitignore**） |
| 说明 | 根目录 `rollinggo.md`（无明文 Key） |

重载 Cursor MCP 后应看到 `rollinggo-hotel`，工具：`searchHotels`、`getHotelDetail`、`getHotelSearchTags`。

---

## 4. 验收 checklist

- [ ] Cursor MCP 列表 `rollinggo-hotel` 在线  
- [ ] 对话调用搜店：返回酒店名 + 参考价（及距离/坐标若有）  
- [ ] `git status`：**无** `.env` / `.cursor/mcp.json` 待提交；无明文 Key 进 diff  
- [ ] Trip 深链路径代码未改，App 行为与接入前一致  

---

## 5. 后续

1. ~~Backend lodging 优先链~~ ✅ [31](./31-RollingGo-lodging接入与地图钉实施.md)  
2. 完整订房 / 订单：RollingGo OAuth 商务（`contact@rollinggo.ai`）  
3. Key 若曾泄露：RollingGo 后台轮换  

---

*文档版本：v1.1 · 2026-08-10*
