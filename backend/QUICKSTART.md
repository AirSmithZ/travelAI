# 快速启动指南

## 前置要求

1. Python 3.8+
2. MySQL 8.0+ (已安装并运行)
3. Redis (已安装并运行)

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

创建 `backend/.env`（必需，密钥不再硬编码在代码中）：

```bash
# 数据库配置
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=19961001
DB_NAME=travel
DB_PORT=3306

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379

# API Keys
DEEPSEEK_API_KEY=sk_your_deepseek_key_here
AMAP_API_KEY=your_amap_server_key_here
AMAP_SECURITY_KEY=your_amap_security_key_here
```

### 3. 初始化数据库

```bash
python init_db.py
```

或者直接运行：

```bash
python -m app.models.travel_models
```

### 4. 启动服务

#### 启动 FastAPI 服务

```bash
# 方式1：使用 uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 方式2：直接运行
python -m app.main
```

#### 启动 Celery Worker（新终端）

```bash
celery -A app.tasks.travel_tasks worker --loglevel=info
```

### 5. 访问API文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 测试API

### 创建旅行规划

```bash
curl -X POST "http://localhost:8000/api/v1/travel/plans" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": ["首尔"],
    "budget": {"min": 0, "max": 10000},
    "interests": ["人文历史", "购物"],
    "food_preferences": ["韩餐"],
    "travelers": "couple",
    "xiaohongshu_notes": [],
    "addresses": [{"city": "首尔", "address": "测试地址"}],
    "flights": []
  }'
```

### 生成路线规划

```bash
curl -X POST "http://localhost:8000/api/v1/travel/plans/1/generate-itinerary" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-01-18",
    "end_date": "2026-01-25"
  }'
```

### 查询任务状态

```bash
curl "http://localhost:8000/api/v1/travel/tasks/{task_id}/status"
```

## 常见问题

### 数据库连接失败

确保MySQL服务正在运行，并且数据库 `travel` 已创建：

```sql
CREATE DATABASE travel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Redis连接失败

确保Redis服务正在运行：

```bash
redis-server
```

### Celery任务不执行

确保：
1. Redis服务正常运行
2. Celery Worker已启动
3. 任务ID正确

## 项目结构说明

- `app/main.py` - FastAPI应用入口
- `app/models/` - 数据库模型
- `app/schemas/` - 数据验证模型
- `app/crud/` - 数据库操作
- `app/api/` - API路由
- `app/services/` - 业务逻辑（AI路线生成）
- `app/tasks/` - Celery异步任务
- `app/utils/` - 工具函数（第三方API客户端）
