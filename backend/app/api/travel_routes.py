from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any
from datetime import date, datetime
from app.schemas.travel_schemas import (
    TravelPlanCreate,
    TravelPlanResponse,
    ConversationCreate,
    ConversationResponse,
    ItineraryDetailResponse,
    GenerateItineraryRequest,
    ItineraryGenerationResponse,
    AttractionResponse,
    RestaurantResponse,
)
from app.crud import travel_crud
from app.tasks import (
    generate_travel_itinerary_task,
    fetch_attractions_task,
    fetch_restaurants_task,
)
from app.services.travel_service import TravelService
from app.utils.api_clients import LocationAPIClient

router = APIRouter(prefix="/travel", tags=["travel"])


# ==================== 辅助函数 ====================

def get_current_user_id() -> int:
    """获取当前用户ID（简化版，实际应该从JWT token中获取）"""
    # TODO: 实现真实的用户认证
    # 暂时固定用户为 1（需要 init_db.py 写入默认用户）
    return 1


@router.get("/geocode")
async def geocode(address: str, location: str = None):
    """地理编码：用于前端根据目的地文本获取地图中心经纬度"""
    client = LocationAPIClient()
    result = client.geocode(address, location=location)
    if not result or result.get("latitude") is None or result.get("longitude") is None:
        raise HTTPException(status_code=404, detail="无法解析该地址")
    return result


# ==================== 旅行规划相关接口 ====================

@router.post("/plans", response_model=TravelPlanResponse, status_code=201)
async def create_travel_plan(
    plan_data: TravelPlanCreate,
    user_id: int = Depends(get_current_user_id)
):
    """创建旅行规划"""
    try:
        plan_id = travel_crud.create_travel_plan(user_id, plan_data)
        if not plan_id:
            raise HTTPException(status_code=500, detail="创建旅行规划失败")
        
        plan = travel_crud.get_travel_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="旅行规划不存在")
        
        return TravelPlanResponse(**plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plans/{plan_id}", response_model=TravelPlanResponse)
async def get_travel_plan(plan_id: int):
    """获取旅行规划详情"""
    plan = travel_crud.get_travel_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="旅行规划不存在")
    return TravelPlanResponse(**plan)


@router.get("/plans", response_model=List[TravelPlanResponse])
async def get_user_travel_plans(user_id: int = Depends(get_current_user_id)):
    """获取用户的所有旅行规划"""
    plans = travel_crud.get_user_travel_plans(user_id)
    return [TravelPlanResponse(**plan) for plan in plans]


# ==================== 路线生成接口 ====================

@router.post("/plans/{plan_id}/generate-itinerary", response_model=ItineraryGenerationResponse)
async def generate_itinerary(
    plan_id: int,
    request: GenerateItineraryRequest,
    background_tasks: BackgroundTasks
):
    """生成旅行路线规划（异步任务）"""
    # 验证旅行规划是否存在
    plan = travel_crud.get_travel_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="旅行规划不存在")
    
    # 启动异步任务
    task = generate_travel_itinerary_task.delay(
        travel_plan_id=plan_id,
        start_date=request.start_date.isoformat(),
        end_date=request.end_date.isoformat()
    )
    
    return ItineraryGenerationResponse(
        task_id=task.id,
        status="pending",
        message="路线生成任务已提交，请使用task_id查询进度"
    )


@router.post("/plans/{plan_id}/generate-itinerary/stream")
async def generate_itinerary_stream(plan_id: int, request: GenerateItineraryRequest):
    """
    生成旅行路线规划（SSE 流式返回）
    前端使用 fetch 读取 text/event-stream。
    """
    plan = travel_crud.get_travel_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="旅行规划不存在")

    travel_service = TravelService()

    def event_iter():
        return travel_service.generate_itinerary_stream(
            travel_plan_id=plan_id,
            start_date=request.start_date,
            end_date=request.end_date,
            destination=plan["destination"],
            interests=plan.get("interests", []) or [],
            food_preferences=plan.get("food_preferences", []) or [],
            travelers=plan.get("travelers", "") or "",
            budget_min=float(plan.get("budget_min", 0) or 0),
            budget_max=float(plan.get("budget_max", 10000) or 10000),
            xiaohongshu_notes=plan.get("xiaohongshu_notes", []) or [],
        )

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        # Nginx 反向代理时避免缓冲导致前端一直 pending 看不到数据
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_iter(), media_type="text/event-stream", headers=headers)


@router.get("/plans/{plan_id}/itinerary", response_model=List[ItineraryDetailResponse])
async def get_itinerary_details(plan_id: int):
    """获取旅行规划的路线详情"""
    details = travel_crud.get_itinerary_details(plan_id)
    if not details:
        raise HTTPException(status_code=404, detail="路线详情不存在")
    return [ItineraryDetailResponse(**detail) for detail in details]


# ==================== 对话记录接口 ====================

@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    conversation_data: ConversationCreate,
    user_id: int = Depends(get_current_user_id)
):
    """创建对话记录"""
    try:
        conv_id = travel_crud.create_conversation(user_id, conversation_data)
        if not conv_id:
            raise HTTPException(status_code=500, detail="创建对话记录失败")
        
        # 返回创建的对话记录（简化版）
        return ConversationResponse(
            id=conv_id,
            user_id=user_id,
            travel_plan_id=conversation_data.travel_plan_id,
            message=conversation_data.message,
            sender=conversation_data.sender,
            timestamp=datetime.now()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plans/{plan_id}/conversations", response_model=List[ConversationResponse])
async def get_plan_conversations(plan_id: int):
    """获取指定旅行规划的所有对话记录"""
    conversations = travel_crud.get_conversations_by_plan(plan_id)
    return [ConversationResponse(**conv) for conv in conversations]


# ==================== 景点和餐厅接口 ====================

@router.get("/attractions", response_model=List[AttractionResponse])
async def search_attractions(
    city: str = None,
    keyword: str = None
):
    """搜索景点"""
    attractions = travel_crud.search_attractions(city=city, keyword=keyword)
    return [AttractionResponse(**attr) for attr in attractions]


@router.get("/restaurants", response_model=List[RestaurantResponse])
async def search_restaurants(
    city: str = None,
    cuisine_type: str = None,
    keyword: str = None
):
    """搜索餐厅"""
    restaurants = travel_crud.search_restaurants(
        city=city,
        cuisine_type=cuisine_type,
        keyword=keyword
    )
    return [RestaurantResponse(**rest) for rest in restaurants]


# ==================== 任务状态查询接口 ====================

@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """查询异步任务状态"""
    from celery.result import AsyncResult
    from app.tasks import celery_app
    
    task_result = AsyncResult(task_id, app=celery_app)
    
    if task_result.state == "PENDING":
        response = {
            "task_id": task_id,
            "status": "pending",
            "message": "任务等待中"
        }
    elif task_result.state == "PROGRESS":
        response = {
            "task_id": task_id,
            "status": "progress",
            "message": "任务执行中",
            "progress": task_result.info.get("progress", 0)
        }
    elif task_result.state == "SUCCESS":
        response = {
            "task_id": task_id,
            "status": "success",
            "message": "任务完成",
            "result": task_result.result
        }
    else:
        response = {
            "task_id": task_id,
            "status": "failure",
            "message": "任务失败",
            "error": str(task_result.info)
        }
    
    return response


# ==================== 推荐接口 ====================

@router.get("/recommendations")
async def get_recommendations(
    destination: str,
    interests: str = None,
    food_preferences: str = None
):
    """获取推荐景点和餐厅"""
    travel_service = TravelService()
    
    interests_list = interests.split(",") if interests else []
    food_prefs_list = food_preferences.split(",") if food_preferences else []
    
    recommendations = travel_service.get_recommendations(
        destination=destination,
        interests=interests_list,
        food_preferences=food_prefs_list
    )
    
    return recommendations
