# Scrapling 项目调研报告

> 调研日期：2026-08-10  
> 最新版本：v0.4.13  
> 许可证：BSD 3-Clause License（免费开源）

---

## 一、项目概述

**Scrapling** 是一个面向现代 Web 的**自适应网络爬虫框架**，核心理念是实现 "effortless web scraping"（轻松的网络抓取）。

| 属性 | 详情 |
|------|------|
| 官方仓库 | GitHub (FlorianParisse / d4vinci) |
| PyPI 包名 | `scrapling` |
| 最新版本 | v0.4.13 |
| Python 要求 | 3.10+ |
| 许可证 | **BSD 3-Clause**（商业友好，免费使用） |
| Docker 镜像 | `pyd4vinci/scrapling` / `ghcr.io/d4vinci/scrapling:latest` |

---

## 二、是否可以免费使用？

**✅ 完全可以免费使用**，无任何费用：

- **开源免费**：采用 BSD 3-Clause License，允许：
  - 自由使用、修改、分发
  - 用于商业项目
  - 无订阅费、无 API 调用费、无功能限制
- **无隐藏成本**：所有功能（包括 StealthyFetcher、反反爬、Spider 框架）均免费
- **唯一成本**：运行时基础设施（服务器、代理 IP 等），这是所有爬虫方案的共性成本

---

## 三、核心功能特性

### 1. 自适应抓取（核心卖点）

- **智能元素追踪**：使用相似度算法，当网页结构变更时自动重新定位目标元素
- **`auto_save` 机制**：自动保存选择器状态，网站改版后通过 `adaptive=True` 重新定位
- **自动选择器生成**：为任意元素生成稳健的 CSS/XPath 选择器

### 2. 反反爬能力

| 组件 | 能力 |
|------|------|
| **Fetcher** | 快速 HTTP 请求，支持模拟浏览器 TLS 指纹、HTTP/3 |
| **StealthyFetcher** | 高级隐身模式，指纹欺骗，绕过 Cloudflare Turnstile 等反机器人系统 |
| **DynamicFetcher** | 基于 Playwright + Chromium 的动态页面加载抓取 |
| **ProxyRotator** | 内置代理轮换，支持循环或自定义策略 |
| **DNS 泄漏防护** | 支持 DNS-over-HTTPS (Cloudflare DoH) |
| **域名/广告拦截** | 内置 ~3,500 个广告/追踪域名黑名单 |

### 3. 完整爬虫框架（Spiders）

- **Scrapy 风格 API**：`start_urls`、异步 `parse` 回调、`Request`/`Response` 对象
- **内置模板**：`CrawlSpider`、`SitemapSpider`、`XMLFeedSpider`、`CSVFeedSpider`、`ShopifySpider`
- **并发控制**：可配置的并发限制、每域名节流、下载延迟
- **暂停与恢复**：基于检查点的持久化，支持优雅中断后继续抓取
- **流式模式**：`async for item in spider.stream()` 实时输出
- **自动重试**：自动检测被拦截请求并重试
- **AutoThrottle**：根据网站响应速度自动调整延迟，遵守 `Retry-After`
- **Robots.txt 合规**：可选的 `robots_txt_obey` 标志
- **多会话管理**：统一接口处理 HTTP 请求和无头浏览器
- **导出功能**：内置 JSON/JSONL/CSV/XML 导出器
- **开发模式**：首次运行缓存响应到磁盘，后续直接回放

### 4. AI 集成

- **MCP 服务器**：内置 MCP 服务器，支持 AI 辅助网页抓取（Claude/Cursor 等）
- **Token 优化**：先提取目标内容再传给 AI，减少 Token 消耗
- **截图能力**：支持页面截图和远程浏览器控制
- **Agent Skill**：提供现成的 Agent Skill，教导编码代理正确使用 API

### 5. 开发者体验

- **交互式 Shell**：内置 IPython shell，支持 curl 转 Scrapling 请求
- **CLI 支持**：无需编写代码即可通过终端抓取 URL
- **丰富导航 API**：DOM 遍历（父/子/兄弟节点）
- **完整类型提示**：通过 PyRight 和 MyPy 扫描
- **Scrapy 集成**：支持直接解析 Scrapy 响应，无需重写代码
- **高性能**：JSON 序列化速度比标准库快 10 倍，内存占用低

---

## 四、能获取什么网页信息？

Scrapling 可以获取**几乎所有公开可访问的网页信息**：

### ✅ 支持抓取的内容类型

| 内容类型 | 说明 | 示例 |
|----------|------|------|
| **静态文本** | 页面中的文字内容 | 文章标题、正文、描述 |
| **结构化数据** | 表格、列表、卡片 | 商品价格、电商产品列表 |
| **链接** | 页面内所有链接 | 导航链接、分页链接、相关文章 |
| **图片** | 图片 URL、alt 文本 | 产品图片、头像、缩略图 |
| **元数据** | Meta 标签、Open Graph | 页面标题、描述、SEO 信息 |
| **动态内容** | JavaScript 渲染的页面 | SPA 应用、懒加载内容（需 DynamicFetcher） |
| **API 响应** | XHR/Fetch 请求 | 后台 API 数据（`capture_xhr` 功能） |
| **表单数据** | 页面表单字段 | 输入框默认值、下拉选项 |
| **Cookie/Session** | 会话状态 | 登录后页面内容（需会话管理） |

### ✅ 支持的网站类型

- 电商网站（商品列表、价格、评论）
- 新闻门户（文章标题、内容、发布时间）
- 社交媒体（公开帖子、用户信息）
- 搜索引擎结果页
- 论坛/社区（帖子列表、回复）
- 数据展示网站（表格、图表数据）
- 企业官网（公司信息、联系方式）
- 政府公开数据网站

### ⚠️ 限制与注意事项

| 限制 | 说明 |
|------|------|
| **需要登录的私有内容** | 需实现登录流程或使用已认证会话 |
| **极端反爬策略** | 部分网站有极强的反爬机制，可能需要额外配置代理、指纹 |
| **大规模爬取** | 建议遵守 robots.txt，使用 AutoThrottle 避免对目标站点造成压力 |
| **法律合规** | 需遵守目标网站的 Terms of Service 及当地数据保护法规 |
| **Canvas/ WebGL 指纹** | 高级指纹检测可能需要更复杂的绕过策略 |

---

## 五、安装与快速开始

### 安装

```bash
# 基础安装（仅解析器）
pip install scrapling

# 完整安装（含抓取器、浏览器依赖、全部功能）
pip install "scrapling[all]"
scrapling install  # 下载浏览器二进制及系统依赖
```

### 快速示例

**示例 1：自适应抓取**
```python
from scrapling.fetchers import StealthyFetcher

StealthyFetcher.adaptive = True
page = StealthyFetcher.fetch('https://example.com', headless=True, network_idle=True)

# 自动保存选择器状态
products = page.css('.product', auto_save=True)

# 网站结构变化后，自动重新定位
products = page.css('.product', adaptive=True)
```

**示例 2：Spider 爬取**
```python
from scrapling.spiders import Spider, Response

class MySpider(Spider):
    name = "demo"
    start_urls = ["https://example.com/"]

    async def parse(self, response: Response):
        for item in response.css('.product'):
            yield {"title": item.css('h2::text').get()}

MySpider().start()
```

**示例 3：CLI 直接抓取**
```bash
# 无需编写代码，命令行直接抓取
scrapling fetch "https://example.com"
```

---

## 六、与其他工具的对比

| 特性 | Scrapling | Scrapy | Playwright | BeautifulSoup |
|------|-----------|--------|------------|---------------|
| 自适应选择器 | ✅ 核心功能 | ❌ | ❌ | ❌ |
| 反反爬绕过 | ✅ 内置 | ❌ 需插件 | ⚠️ 需配置 | ❌ |
| 爬虫框架 | ✅ 内置 | ✅ 核心 | ❌ | ❌ |
| 动态页面 | ✅ DynamicFetcher | ⚠️ 需集成 | ✅ 核心 | ❌ |
| AI/MCP 集成 | ✅ 内置 | ❌ | ❌ | ❌ |
| 学习曲线 | 中等 | 陡峭 | 中等 | 简单 |
| 并发支持 | ✅ 异步 | ✅ 原生 | ✅ 异步 | ❌ |

---

## 七、总结与推荐

### ✅ 推荐使用的场景

1. **网站结构频繁变更**：自适应抓取是核心优势，大幅降低维护成本
2. **需要绕过反爬**：内置 StealthyFetcher，开箱即用绕过 Cloudflare 等
3. **AI 辅助抓取**：MCP 服务器集成，适合与 Claude/Cursor 等 AI 工具配合
4. **快速原型开发**：CLI + Shell 支持，无需编写代码即可测试
5. **从 Scrapy 迁移**：提供 Scrapy 集成，降低迁移成本

### ⚠️ 需要注意的事项

1. **法律合规**：爬取前确认目标网站的服务条款和当地法律法规
2. **道德爬取**：建议使用 AutoThrottle、遵守 robots.txt
3. **代理成本**：大规模爬取需要代理 IP，这是额外成本
4. **Python 3.10+**：需要较新的 Python 版本

### 📊 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 免费程度 | ⭐⭐⭐⭐⭐ | BSD 3-Clause，完全免费 |
| 功能完整性 | ⭐⭐⭐⭐⭐ | 解析器 + 抓取器 + Spider + AI 集成 |
| 反反爬能力 | ⭐⭐⭐⭐ | 绕过 Cloudflare 等主流反爬 |
| 自适应能力 | ⭐⭐⭐⭐⭐ | 核心卖点，业界领先 |
| 文档完善度 | ⭐⭐⭐⭐ | Diátaxis 框架，文档结构清晰 |
| 易用性 | ⭐⭐⭐⭐ | API 设计简洁，CLI 友好 |

---

## 八、结论

**Scrapling 是一个完全免费、功能强大的现代 Web 爬虫框架**，特别适合以下需求：

- ✅ 需要免费、开源的爬虫解决方案
- ✅ 目标网站结构不稳定，需要自适应能力
- ✅ 需要绕过主流反反爬机制（Cloudflare 等）
- ✅ 希望与 AI 工具（Claude/Cursor）配合使用
- ✅ 需要抓取动态渲染页面和后台 API 数据

**能够获取的信息范围**：几乎所有公开网页的文本、链接、图片、结构化数据、元数据，以及动态加载内容和 API 响应数据。

**项目成熟度**：v0.4.13 版本，功能齐全，提供 Docker 镜像，文档完善，是一个值得信赖的生产级工具。

---

## 九、使用方式说明

### 完全自动化，无需人工操作网页

Scrapling 支持三种全自动使用方式，**全程无需人工干预**：

| 方式 | 说明 | 是否需要人工操作 |
|------|------|-----------------|
| **Python 代码** | 写几行代码自动抓取 | ❌ 全自动 |
| **命令行 CLI** | `scrapling fetch "https://xxx.com"` | ❌ 全自动 |
| **MCP AI 集成** | Claude/Cursor 调用自动抓取 | ❌ 全自动 |

即使是 `StealthyFetcher` 的 `headless=True`（无头模式），浏览器也是**在后台自动运行**，你看不到窗口，但它会自动加载页面、渲染 JavaScript、提取数据，全程无需人工干预。

**唯一可能需要人工干预的场景**：目标网站有手动验证码（如拖拽拼图），这是所有自动化工具的共性问题，不是 Scrapling 特有的。

---

## 十、酒店信息抓取场景分析

### 场景：多平台酒店数据抓取

**需求**：从多个 OTA 平台（Booking、Agoda、携程等）抓取酒店完整信息（名称、地址、星级、价格、评分、评论、设施、房型、图片等）

### ✅ Scrapling 完全胜任，技术方案如下

#### 整体架构

```
┌─────────────────────────────────────────────────┐
│           多平台酒店爬虫系统                       │
├─────────────────────────────────────────────────┤
│  Spider 1: Booking         Spider 2: Agoda       │
│  Spider 3: 携程            Spider 4: 酒店官网      │
│                 ↘                   ↙            │
│          统一数据模型（JSON/CSV 导出）             │
└─────────────────────────────────────────────────┘
```

#### 示例代码框架

```python
from scrapling.spiders import Spider, Response
from scrapling.fetchers import StealthyFetcher


class BookingSpider(Spider):
    name = "booking"
    start_urls = ["https://www.booking.com/searchresults.html?checkin=2026-08-15&checkout=2026-08-16&dest=Shanghai"]
    auto_throttle = True  # 自动限速，避免被封
    concurrent_requests = 5

    async def parse(self, response: Response):
        # 自适应抓取，网站改版后自动重新定位
        hotels = response.css('.sr_property_name', auto_save=True)
        
        for hotel in hotels:
            yield {
                "source": "booking",
                "name": hotel.css('a::text').get(),
                "price": hotel.css('.b-price::text').get(),
                "rating": hotel.css('.review-score::text').get(),
                "reviews": hotel.css('.review-count::text').get(),
                "stars": hotel.css('.hotel-stars::attr(class)').get(),
                "url": hotel.css('a::attr(href)').get(),
                "address": hotel.css('.sr-hotel-address::text').get(),
            }


class CtripSpider(Spider):
    name = "ctrip"
    start_urls = ["https://hotels.ctrip.com/hotels/list?city=上海"]
    fetcher_cls = StealthyFetcher  # 携程反爬强，用隐身模式

    async def parse(self, response: Response):
        hotels = response.css('.hotel-list-item', adaptive=True)
        
        for hotel in hotels:
            yield {
                "source": "ctrip",
                "name": hotel.css('.hotel-name::text').get(),
                "price": hotel.css('.price::text').get(),
                "rating": hotel.css('.score::text').get(),
                "image": hotel.css('.hotel-img::attr(src)').get(),
                "facilities": hotel.css('.facility-tag::text').getall(),
            }


# 运行所有爬虫
BookingSpider().start()
CtripSpider().start()
```

#### 关键能力对应

| 需求 | Scrapling 对应能力 |
|------|-------------------|
| 多平台 | 多个 Spider 类，独立配置 |
| OTA 反爬强 | StealthyFetcher 绕过 Cloudflare 等 |
| 网站改版 | `adaptive=True` 自适应选择器 |
| 完整字段 | CSS/XPath 选择器提取任意字段 |
| 定时抓取 | Spider 流式模式 + 定时任务 |
| 导出结果 | 内置 JSON/CSV 导出 |
| 并发控制 | `concurrent_requests` + AutoThrottle |
| 中断续爬 | 检查点持久化，暂停后恢复 |

#### 可抓取的酒店字段清单

- **基础信息**：酒店名称、地址、星级、电话、价格
- **评价数据**：评分、评论数、评论文本
- **设施信息**：WiFi、早餐、停车场、泳池、健身房等
- **房型详情**：房型名称、面积、床型、价格、库存
- **图片资源**：酒店图片列表、房型图片
- **地理位置**：经纬度、周边地标、距离信息
- **实时数据**：促销信息、价格变动、库存状态

#### 风险与应对

| 风险点 | 应对方案 |
|--------|---------|
| OTA 平台反爬强 | StealthyFetcher + 代理轮换 + AutoThrottle |
| 数据量巨大 | 分页爬取 + 流式输出 + 检查点续爬 |
| 网站频繁改版 | 自适应抓取 `adaptive=True` 自动适应 |
| 法律合规 | 控制频率，遵守 robots.txt，仅用于个人/研究用途 |