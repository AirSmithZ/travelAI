# flight-spike

独立验证：**航班搜索 + Trip.com 购买链接**（不订票）。

## 快速开始

```bash
cd flight-spike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Trip.com 链接（默认，秒级）
python scripts/search_rank.py SHA SIN 2026-10-16 --no-letsfg --no-duffel

# 可选 LetsFG 参考价（慢）
python scripts/search_rank.py SHA SIN 2026-10-16

# Ignav API（Tier 1.5，需 IGNAV_API_KEY）
cp ../.env.example ../.env   # 或确保 travel/.env 含 IGNAV_API_KEY
python scripts/tier15_ignav.py
```

## 主项目 API

Phase 1 已迁入 travel backend。**主 App 尚未接入航班 UI**，请用下列方式验证：

```bash
# CLI
curl -X POST http://localhost:8000/api/v1/flights/search \
  -H 'Content-Type: application/json' \
  -d '{"origin":"上海","destination":"新加坡","date":"2026-10-16"}'

# 简易验证页（backend + frontend dev 同时启动）
# http://localhost:5173/flight-verify.html
# 自然语言输入，LLM 解析后自动调 search
```

## 流程

```
SearchRequest → tripcom showfarefirst URL（主）
             → LetsFG（可选，--no-letsfg 跳过）
             → rank → JSON
```

文档：
- [Trip.com 实施方案](../docs/llm-travel-data/01-航班信息-Trip.com实施方案.md)
- [Ignav 验证方案](../docs/llm-travel-data/01-航班信息-Ignav验证方案.md) · [验证报告](../docs/llm-travel-data/01-航班信息-Ignav验证报告.md)
