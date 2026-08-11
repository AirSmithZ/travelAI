# RollingGo 酒店 MCP（本地配置说明）

> **勿在本文件写入 API Key。** Key 只放 `.env` 的 `ROLLINGGO_MCP_API_KEY`，以及已 gitignore 的 `.cursor/mcp.json`。

## 与 Trip 的关系

不冲突：Trip 深链 = 浏览/成交出口；RollingGo = 结构化搜店 + 参考价钉（`HOT-RG-02`）。详见 [29](docs/llm-travel-data/29-RollingGo-MCP接入与Trip并存.md) · [31](docs/llm-travel-data/31-RollingGo-lodging接入与地图钉实施.md)。

## 接入步骤

1. 在 [rollinggo.store/apply](https://rollinggo.store/apply) 申请 Key，写入 `.env`：
   ```bash
   ROLLINGGO_MCP_API_KEY=mcp_你的密钥
   ROLLINGGO_MCP_URL=https://mcp.rollinggo.cn/mcp
   # LODGING_ENABLE_SERP=false   # 默认不走 Serp Maps lodging
   ```
2. Cursor MCP（可选探通）：`cp .cursor/mcp.json.example .cursor/mcp.json` 后填 Bearer。
3. 重启后端；住宿面板确认片区后点「搜索片区酒店」应出现候选钉与参考价。

## 本波不用 Skill CLI 进 App

产品路径走后端 MCP JSON-RPC；`.agents/skills/rollinggo-hotel-booking` 仅 Agent 订房场景。

## 轮换提醒

若 Key 曾出现在聊天或未忽略的文件中，请在 RollingGo 后台轮换后再更新 `.env` 与 `.cursor/mcp.json`。
