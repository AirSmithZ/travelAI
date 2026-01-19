from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import router
from app.models import create_all_tables

# 创建FastAPI应用
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI旅行路线规划后端API",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(router, prefix=settings.API_V1_PREFIX)


@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    print("🚀 Travel Planner API 启动中...")
    # 不再自动初始化数据库，避免重复执行。
    # 如需初始化请手动运行：python init_db.py


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    print("👋 Travel Planner API 关闭中...")


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Welcome to Travel Planner API",
        "version": settings.VERSION,
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
