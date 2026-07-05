# flight-spike REPORT

完整分析见：

- [Spike 验证报告](../docs/llm-travel-data/01-航班信息-Spike验证报告.md)（Tier 0–3，2026-07-01）
- [Ignav 验证报告](../docs/llm-travel-data/01-航班信息-Ignav验证报告.md)（Tier 1.5，2026-07-02）

**决策（2026-07-03）**：Trip.com Deep Link = 预订 CTA；**Ignav = App 内查价主源（Go 3/3）**；LetsFG = fallback。

**原始 JSON**：

- `output/2026-07-01/` — Tier 0–3
- `output/2026-07-03/tier15_ignav.json` — Ignav ✅

## 快速运行

```bash
# Trip.com Deep Link
python scripts/search_rank.py PVG SIN 2026-10-16 --no-letsfg

# Ignav（需 .env 中 IGNAV_API_KEY）
cp .env.example .env
python scripts/tier15_ignav.py

# 全量 Tier 0–3
python scripts/run_all.py
```
