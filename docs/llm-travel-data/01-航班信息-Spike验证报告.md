# 航班信息 Spike 验证报告

← [返回 01-航班信息](./01-航班信息.md) · 原始数据：`flight-spike/output/2026-07-01/`

> **执行日期**：2026-07-01  
> **执行方式**：按 [§6 独立 Spike 方案](./01-航班信息.md#6-快速验证专项spike--独立项目方案) 搭建 `flight-spike/` 并运行 `scripts/run_all.py`  
> **参考 Skill**：`llm-api-engineering`（外部服务超时、结构化落盘、不静默降级）

---

## 1. 结论摘要

| 决策 | **Go-A+（Deep Link 为主）+ 有条件 Go-B（LetsFG 异步参考价）** |
|------|----------------------------------------------------------------|
| **Tier 0 Deep Link** | ✅ 3/3 航线通过，**立即可用** |
| **Tier 1 LetsFG** | ⚠️ 1/3 航线在 180s 内成功；**延迟 ~158s**；预订链接需 LetsFG 付费解锁 |
| **Tier 2 fast-flights** | ❌ Google Flights 请求 **60s 超时**（当前网络环境） |
| **Tier 1.5 Ignav** | ✅ **3/3 成功**（2026-07-03）；P50 **≈5.7s**；21/17/25 offers；见 [Ignav 验证报告](./01-航班信息-Ignav验证报告.md) |
| **Tier 3 Duffel** | ⏭️ 未执行（未配置 `DUFFEL_TOKEN`） |

**一句话（更新 2026-07-03）**：**Ignav REST 已验证 3/3 航线、秒级延迟**，推荐作 App 内查价 + LLM 分析主源；Trip.com Deep Link 作预订 CTA；LetsFG 降为 fallback；Duffel 仍待 Sandbox。

---

## 2. 测试环境

| 项 | 值 |
|----|-----|
| 机器 | darwin，Python 3.13 |
| 目录 | `flight-spike/`（独立于 travel 主项目） |
| LetsFG | `letsfg 2026.5.79`，`--mode fast --limit 5 --currency USD` |
| fast-flights | `3.0.2` |
| Tier1 超时 | 180s/航线 |
| Duffel | 无 Token，跳过 |

---

## 3. 分 Tier 结果

### 3.1 Tier 0 — Deep Link ✅

| 航线 | URL 生成 | 人工可打开 |
|------|----------|------------|
| PVG→SIN 2026-10-16 | ✅ | 待用户确认 |
| HKG→NRT 2026-11-01 | ✅ | 待用户确认 |
| LHR→JFK 2026-07-15 | ✅ | 待用户确认 |

示例：

```
https://www.google.com/travel/flights?q=Flights%20PVG%20to%20SIN%20on%202026-10-16
```

**结论**：零依赖、零延迟，**永远保留为 Fallback**。

---

### 3.2 Tier 1 — LetsFG CLI ⚠️

| 航线 | 成功 | 延迟 | 报价数 | 备注 |
|------|------|------|--------|------|
| **PVG→SIN** | ✅ | **158,168 ms（≈2.6 min）** | 5 | 见下表 |
| **HKG↔NRT**（往返 2 人） | ❌ | 180,096 ms | 0 | **180s 超时** |
| **LHR→JFK** | ❌ | 180,247 ms | 0 | **180s 超时** |

**PVG→SIN 样本报价**（`--mode fast`，USD）：

| # | 价格 | 航司 | 航线 | 时长 | 经停 |
|---|------|------|------|------|------|
| 1 | 104.00 | D7 | PVG→KUL→… | 14h45m | 1 |
| 2 | 127.77 | 9C | PVG→SIN | 5h40m | 0 |
| 3 | 206.91 | SQ | PVG→SIN | 5h25m | 0 |
| 4 | 216.33 | HO | PVG→SIN | 5h20m | 0 |
| 5 | 259.10 | CA | PVG→SIN | 5h50m | 0 |

**重要发现**：

1. **并非完全免费 API**：stdout 含 `Unlock offers (pay the LetsFG fee to reveal booking link)`，预订 deep link 指向 `letsfg.co/book/...`，需平台侧解锁。
2. **stderr 大量 Playwright 报错**（KAYAK/MOMONDO/IXIGO 等浏览器未安装），但 PVG→SIN 仍靠部分连接器出结果 → **稳定性依赖本地浏览器环境**。
3. **`--mode fast` 仍远超文档写的 20–40s**，实测 **>150s**，不满足同步 HTTP 接口。
4. **成功率 1/3**（180s 窗口内），未达 §6.4 建议阈值「≥2/3」。

**Tier 1 判定**：可作 **Spike 参考价源**，**不可**作 travel 项目同步 API；若接入需：
- 独立 Worker + 队列（超时 ≥300s）
- `meta.provenance`: `source=letsfg`, `confidence=medium`
- 不展示 LetsFG 付费预订链，或仅作「前往 LetsFG 查看」外链并披露

---

### 3.3 Tier 2 — fast-flights（Google Flights 爬虫）❌

| 航线 | 成功 | 延迟 | 错误 |
|------|------|------|------|
| PVG→SIN | ❌ | ~60,000 ms | `TimeoutError` 访问 `google.com/travel/flights` |
| HKG→NRT | ❌ | ~60,000 ms | 同上 |

**结论**：在当前网络下 **无法稳定抓取 GF**；可能需代理/VPN 或海外运行环境。Spike **不建议**继续投入，除非部署到可访问 Google 的服务器重试。

---

### 3.4 Tier 1.5 — Ignav REST API ⏸

| 状态 | **2026-07-03 完整执行 — Go** |
|------|------------------------------|
| **脚本** | `flight-spike/scripts/tier15_ignav.py` |
| **成功率** | **3/3** |
| **延迟 P50** | ≈5.7s（二次运行 ≈1.3s，可能有缓存） |
| **Key** | `travel/.env` → `IGNAV_API_KEY` |

详见 [Ignav 验证报告](./01-航班信息-Ignav验证报告.md)。

---

### 3.5 Tier 3 — Duffel Sandbox ⏭️

| 状态 | 原因 |
|------|------|
| **跳过** | 环境未设置 `DUFFEL_TOKEN` |

**补跑步骤**（约 30 分钟）：

1. 注册 [Duffel Dashboard](https://app.duffel.com) → Test mode  
2. `export DUFFEL_TOKEN=duffel_test_...`  
3. `cd flight-spike && source .venv/bin/activate && python scripts/run_all.py`（或仅 curl §6.4 示例）  
4. 验证 LHR→JFK Offer 能否映射 §3 `FlightQuote`

**预期**：集成契约可靠、延迟 <10s；Sandbox 价/时刻非真实亚太数据。

---

## 4. 对比总表（§6.5）

| 航线 | Tier0 | Tier1 LetsFG | Tier1.5 Ignav | Tier2 GF | Tier3 Duffel | 最低价（Tier1） |
|------|-------|--------------|---------------|----------|--------------|-----------------|
| PVG→SIN | ✅ | ✅ 158s | ✅ 11.7s / 21 offers | ❌ timeout | — | USD 126 (Ignav) |
| HKG↔NRT | ✅ | ❌ timeout | ✅ 5.7s / 17 offers | ❌ timeout | — | USD 498 (Ignav) |
| LHR→JFK | ✅ | ❌ timeout | ✅ 2.8s / 25 offers | — | ⏭️ 未测 | USD 713 (Ignav) |

---

## 5. Go/No-Go 决策

| 选项 | 判定 | 理由 |
|------|------|------|
| **A — 仅 Deep Link** | ✅ **采用** | Tier0 稳定；Tier1/2 未达生产门槛 |
| **B — LetsFG 参考价** | ⚠️ **可选、异步** | 仅 PVG→SIN 验证通过；慢、付费解锁、1/3 成功率 |
| **C — Duffel 正式 API** | ⏳ **待补测** | 未跑 Sandbox；长期最像「产品级」方案 |
| **D — 混合** | 远期 | A + 异步 B + 补测通过后 C |
| **E — Ignav + Trip CTA** | ✅ **采用** | 3/3 验证通过；Ignav 查价/LLM；Trip.com 预订 |

### 接入 travel 项目的建议顺序

1. **现在**：实现 `deeplink.py` + `POST /flights/search` 返回 URL 列表（Tier0）  
2. **可选实验**：`letsfg_provider.py` 后台任务，**不阻塞**生成行程  
3. **下一步 Spike**：配置 `DUFFEL_TOKEN` 补 Tier3，更新本报告  
4. **不要**：同步调用 LetsFG 阻塞 `/itineraries/generate`；不要把 LetsFG 价当可预订价

---

## 6. 产物与复现

```
flight-spike/
├── fixtures/routes.json
├── scripts/run_all.py
├── requirements.txt
└── output/2026-07-01/
    ├── tier0_deeplink.json
    ├── tier1_letsfg.json      # 含 PVG→SIN 完整 stdout
    ├── tier2_fast_flights.json
    ├── tier3_duffel.json      # skipped
    └── summary.json
```

```bash
cd flight-spike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# 可选: export DUFFEL_TOKEN=duffel_test_...
python scripts/run_all.py
```

LetsFG 单条复现（与 Spike 一致）：

```bash
time letsfg search PVG SIN 2026-10-16 --mode fast --limit 5 --currency USD
```

---

## 7. 对 §6 文档的修正建议

| 原描述 | 实测修正 |
|--------|----------|
| LetsFG `--mode fast` 20–40s | PVG→SIN **≈158s** |
| Tier1 成功率 ≥2/3 @180s | 仅 **1/3** |
| LetsFG「无 API Key 免费搜索」 | 搜索免费，**预订链接需 LetsFG 付费解锁** |
| `fast-flights` import `FlightData` | v3 改为 `FlightQuery` + `create_query` |
| Tier2 包名 `flights` | PyPI 为 **`fast-flights`** |

---

*报告版本：v1.0 · Spike 首次执行 · 2026-07-01*
