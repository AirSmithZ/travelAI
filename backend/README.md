# Travel Planner Backend

基于 Python 和 FastAPI 的 AI 旅行路线规划后端服务。

## 技术栈

- **编程语言**: Python 3.8+
- **Web框架**: FastAPI
- **AI框架**: LangChain + DeepSeek API
- **异步任务**: Celery + Redis
- **数据库**: MySQL 8.0
- **缓存**: Redis
- **第三方API**: 
  - 高德地图 API（国内地点）
  - Google Places API（国外地点）
  - 小红书 API（笔记内容）
- **容器化**: Docker + Docker Compose

## 项目结构

```
travel_planner_backend/
│
├── app/
│   ├── main.py                  # FastAPI应用入口
│   ├── config.py                # 配置文件
│   ├── models/                  # 数据库模型定义
│   │   └── travel_models.py
│   ├── schemas/                 # Pydantic数据验证和序列化
│   │   └── travel_schemas.py
│   ├── crud/                    # 数据库操作封装
│   │   └── travel_crud.py
│   ├── api/                     # API路由定义
│   │   └── travel_routes.py
│   ├── services/                # 业务逻辑处理
│   │   └── travel_service.py
│   ├── tasks/                   # 异步任务定义
│   │   └── travel_tasks.py
│   └── utils/                   # 工具函数和辅助模块
│       └── api_clients.py
│
├── tests/                       # 测试用例
│   └── test_travel_planner.py
│
├── Dockerfile                   # Docker镜像构建文件
├── docker-compose.yml           # Docker Compose配置文件
├── requirements.txt             # Python依赖包列表
└── README.md                    # 项目说明文档
```

## 数据库设计

### 主要数据表

1. **users** - 用户表
2. **travel_plans** - 旅行规划表
3. **conversation_logs** - 对话记录表
4. **itinerary_details** - 路线规划详情表
5. **attractions** - 景点表
6. **restaurants** - 餐厅表
7. **flights** - 航班表
8. **accommodations** - 居住表

## 快速开始

### 1. 环境要求

- Python 3.8+
- MySQL 8.0+
- Redis 6.0+

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并配置相关参数：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置数据库连接、API密钥等信息。

### 4. 初始化数据库

```bash
python -m app.models.travel_models
```

### 5. 启动服务

#### 方式一：直接运行

```bash
cd /Users/zhouyi/Desktop/program/travel/backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt    # 这里已经包含 uvicorn[standard]
# 启动FastAPI服务
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

### 一行命令启动（推荐）

```bash
cd backend && bash run.sh
```

# 启动Celery Worker（新终端）
celery -A app.tasks.travel_tasks worker --loglevel=info
```

#### 方式二：使用Docker Compose

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 6. 访问API文档

启动服务后，访问以下地址查看API文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API接口说明

### 旅行规划相关

- `POST /api/v1/travel/plans` - 创建旅行规划
- `GET /api/v1/travel/plans/{plan_id}` - 获取旅行规划详情
- `GET /api/v1/travel/plans` - 获取用户的所有旅行规划

### 路线生成相关

- `POST /api/v1/travel/plans/{plan_id}/generate-itinerary` - 生成旅行路线（异步）
- `GET /api/v1/travel/plans/{plan_id}/itinerary` - 获取路线详情
- `GET /api/v1/travel/tasks/{task_id}/status` - 查询任务状态

### 对话记录相关

- `POST /api/v1/travel/conversations` - 创建对话记录
- `GET /api/v1/travel/plans/{plan_id}/conversations` - 获取对话记录

### 景点和餐厅相关

- `GET /api/v1/travel/attractions` - 搜索景点
- `GET /api/v1/travel/restaurants` - 搜索餐厅
- `GET /api/v1/travel/recommendations` - 获取推荐

## 使用示例

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
    "addresses": [{"city": "首尔", "address": "模拟居住地址"}],
    "flights": [{
      "departure_airport": "模拟机场落地点",
      "arrival_airport": "模拟机场起飞点",
      "departure_time": "2026-01-18T16:00:00.000Z",
      "return_time": "2026-01-19T16:00:00.000Z"
    }]
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

## 开发说明

### 代码结构说明

- **models/**: 数据库表结构定义和初始化
- **schemas/**: Pydantic模型，用于请求/响应数据验证
- **crud/**: 数据库CRUD操作封装
- **api/**: FastAPI路由定义
- **services/**: 业务逻辑处理，包括AI路线生成
- **tasks/**: Celery异步任务定义
- **utils/**: 工具函数，包括第三方API客户端

### 添加新功能

1. 在 `schemas/` 中定义数据模型
2. 在 `crud/` 中添加数据库操作
3. 在 `services/` 中实现业务逻辑
4. 在 `api/` 中添加路由
5. 如需异步处理，在 `tasks/` 中添加Celery任务

## 测试

```bash
# 运行测试
pytest tests/

# 带覆盖率
pytest tests/ --cov=app --cov-report=html
```

## 部署

### Docker部署

```bash
# 构建镜像
docker build -t travel-planner-backend .

# 运行容器
docker run -d -p 8000:8000 \
  -e DB_HOST=mysql_host \
  -e DB_PASSWORD=your_password \
  travel-planner-backend
```

### Kubernetes部署

参考 `k8s/` 目录下的配置文件（需要自行创建）。

## 注意事项

1. **API密钥安全**: 请妥善保管API密钥，不要提交到代码仓库
2. **数据库密码**: 生产环境请使用强密码
3. **CORS配置**: 根据实际前端地址配置CORS
4. **Redis连接**: 确保Redis服务正常运行
5. **Celery Worker**: 需要单独启动Celery Worker处理异步任务

## 常见问题

### Q: 数据库连接失败？

A: 检查数据库配置是否正确，确保MySQL服务正在运行。

### Q: Celery任务不执行？

A: 确保Redis服务正常运行，并且Celery Worker已启动。

### Q: API调用失败？

A: 检查API密钥是否正确配置，网络连接是否正常。

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
