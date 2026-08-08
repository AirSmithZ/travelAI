# Travel Planner — 后端启动指南

FastAPI 服务，为前端提供对话解析、行程生成、地理编码与航班查价等 API。

---

## 1. 环境要求

| 项 | 要求 |
|----|------|
| Python | **3.11+**（推荐 3.12 / 3.13） |
| 包管理 | `pip` + 虚拟环境 |
| 配置文件 | 项目根目录 `.env`（**不是** `backend/.env`） |

---

## 2. 首次安装

在**项目根目录** `travel/` 下操作：

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，至少填写：
#    DEEPSEEK_API_KEY=...        # 对话 / 行程生成（必填）
#    IGNAV_API_KEY=...           # 航班 App 内查价（阶段 B，推荐）
#    QWEATHER_API_KEY=...        # 和风天气（WX-*，推荐）
#    TAVILY_API_KEY=...          # Tavily 联网（WS-*，推荐）

# 3. 创建并激活虚拟环境
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 4. 安装依赖
pip install -r requirements.txt
```

> **说明**：`app/config.py` 从 `travel/.env` 读取配置（`ROOT_DIR` 指向仓库根目录）。修改 Key 后需**重启** uvicorn 才会生效。

---

## 3. 启动服务

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

| 参数 | 含义 |
|------|------|
| `--reload` | 代码变更自动重载（开发用） |
| `--port 8000` | 监听端口，需与前端 Vite proxy 一致 |

启动成功后终端应出现：

```text
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:app.main:CORS origins: ['http://localhost:5173', ...]
```

---

## 4. 健康检查

```bash
curl http://127.0.0.1:8000/health
```

期望响应示例：

```json
{
  "status": "ok",
  "llm_configured": true,
  "llm_model": "deepseek-v4-pro",
  "llm_model_fallbacks": ["deepseek-v4-flash", "deepseek-chat"],
  "cors_origins": ["http://localhost:5173", "http://127.0.0.1:5173"]
}
```

| 字段 | 说明 |
|------|------|
| `llm_configured: false` | 未配置 `DEEPSEEK_API_KEY`，对话/生成接口会 503 |
| `llm_configured: true` | LLM 可用 |

**API 用量看板（OPS-01 · 开发旁路）**：前端 Vite 启动后打开  
`http://localhost:5173/ops.html`（主应用无入口）。  
后端：`GET /api/v1/ops/usage` · `POST /api/v1/ops/usage/reset`。  
**官方账户**：DeepSeek `/user/balance` · SerpAPI `/account.json` · Tavily `/usage` · TikHub `get_user_info` · 和风 `/finance/v1/summary`（需控制台开通财务权限）。  
会话表仅计本进程 calls/latency；勿用旧 Est.$ 当账单。

交互式文档（开发环境）：

- Swagger UI：<http://127.0.0.1:8000/docs>
- ReDoc：<http://127.0.0.1:8000/redoc>

---

## 5. 与前端联调

后端与前端需**同时运行**：

```bash
# 终端 1 — 后端
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 终端 2 — 前端
cd frontend && npm run dev
# 打开 http://localhost:5173
```

前端 Vite 已将 `/api`、`/health` 代理到 `http://127.0.0.1:8000`，一般**无需**设置 `VITE_API_BASE`。

若前端单独部署、后端在不同域名，构建时设置：

```bash
VITE_API_BASE=https://api.example.com npm run build
```

并确保后端 `CORS_ORIGINS` 包含前端域名。

---

## 6. 主要 API 路由

前缀均为 `/api/v1`（健康检查在根路径 `/health`）。

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 健康 | GET | `/health` | 服务与 LLM 配置状态 |
| 对话 | POST | `/api/v1/chat/parse` | 解析用户消息 → FormPatch |
| 对话 | POST | `/api/v1/chat/parse/stream` | 同上，SSE 流式 |
| 行程 | POST | `/api/v1/itineraries/generate` | 生成玩法行程 |
| 行程 | POST | `/api/v1/itineraries/generate/stream` | 流式生成 |
| 地理 | GET | `/api/v1/geocode/autocomplete` | 地点联想 |
| 地理 | POST | `/api/v1/geocode/search` | 正向地理编码 |
| 航班 | POST | `/api/v1/flights/search` | Ignav 查价 + Trip.com CTA |
| 航班 | POST | `/api/v1/flights/verify-from-text` | 自然语言 → 解析 + 查价 |

### 航班查价示例

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/flights/search \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": "上海",
    "destination": "新加坡",
    "date": "2026-10-16",
    "adults": 1,
    "preference": "balanced",
    "include_ignav": true
  }' | python3 -m json.tool
```

Ignav 单次请求可能 **5～30 秒**；前端超时已设为 130s。需配置 `IGNAV_API_KEY` 且 `FLIGHT_INCLUDE_IGNAV=true`（默认开启）。

---

## 7. 环境变量速查

完整模板见项目根 [`.env.example`](../.env.example)。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | ✅ 对话/生成 | DeepSeek OpenAI 兼容 Key |
| `DEEPSEEK_API_BASE` | 否 | 默认 `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 否 | 生成用模型，默认 `deepseek-v4-pro` |
| `LLM_MODEL_REWRITE` | 否 | parse 用 flash，默认 `deepseek-v4-flash` |
| `CORS_ORIGINS` | 否 | 逗号分隔，默认 localhost:5173 |
| `IGNAV_API_KEY` | 航班查价 | [ignav.com](https://ignav.com/) API Key |
| `FLIGHT_INCLUDE_IGNAV` | 否 | 默认 `true` |
| `FLIGHT_IGNAV_TIMEOUT_SEC` | 否 | 默认 `120` |
| `FLIGHT_INCLUDE_LETSFG` | 否 | **FLT-LETSFG**：LetsFG fallback，**默认 `false` 且保持关闭**。主源为 Ignav；`flight-spike/` 不进主链。可选外部 CLI（不在 requirements）；启用须自装并自担合规/ToS |
| `*_API_BASE` / hosts | — | **SEC-04**：须 `https` 且主机在 allowlist（DeepSeek / TikHub / SerpApi / Nominatim / Photon / QWeather 等），非法配置会拒绝启动 |

---

## 8. 本地测试脚本

在 `backend/` 目录、虚拟环境已激活时：

```bash
# Ignav normalize 单元测试（无网络）
python scripts/test_flight_ignav_parse.py

# 航班意图解析单元测试
python scripts/test_flight_intent_parse.py
```

---

## 9. 常见问题

### `ModuleNotFoundError: No module named 'app'`

在 **`backend/`** 目录下启动，不要从仓库根目录直接跑 uvicorn：

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### 前端显示「后端未启动」

1. 确认 uvicorn 在 8000 端口运行  
2. `curl http://127.0.0.1:8000/health` 返回 200  
3. 前端 `npm run dev` 已启动（依赖 Vite proxy）

### 对话 / 生成返回 503

`.env` 中 `DEEPSEEK_API_KEY` 未设置或为空 → 填 Key 后重启后端。

### 航班搜索无报价 / Ignav 报错

1. 确认 `IGNAV_API_KEY` 已写入 **项目根** `.env`  
2. `FLIGHT_INCLUDE_IGNAV=true`  
3. 查看响应 `errors.ignav` 字段  
4. 城市名需能被 `city_codes.json` 解析为 IATA（如「上海」「新加坡」）

### 修改 `.env` 不生效

`get_settings()` 有缓存；**重启 uvicorn**（`--reload` 不会监听 `.env` 变更）。

---

## 10. 生产部署提示（简要）

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

- 使用进程管理（systemd、Docker、PM2 等）保活  
- `CORS_ORIGINS` 设为实际前端域名  
- 勿将 `.env` 提交到 Git  
- 生产建议去掉 `--reload`，按 CPU 调整 `--workers`

---

*后端 README · 2026-07-03*
