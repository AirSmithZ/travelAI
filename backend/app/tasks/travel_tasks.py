from celery import Celery
from datetime import date
from typing import Dict, Any
from app.config import settings
from app.services.travel_service import TravelService
from app.crud import travel_crud

# 创建Celery应用
celery_app = Celery(
    "travel_planner",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

# Celery配置
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5分钟超时
    task_soft_time_limit=240,  # 4分钟软超时
)


@celery_app.task(name="generate_travel_itinerary", bind=True)
def generate_travel_itinerary_task(
    self,
    travel_plan_id: int,
    start_date: str,
    end_date: str
) -> Dict[str, Any]:
    """
    异步生成旅行路线规划任务
    
    Args:
        travel_plan_id: 旅行规划ID
        start_date: 出发日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        生成结果字典
    """
    try:
        # 获取旅行规划信息
        plan = travel_crud.get_travel_plan(travel_plan_id)
        if not plan:
            return {
                "success": False,
                "error": f"旅行规划 {travel_plan_id} 不存在"
            }
        
        # 解析日期
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        
        # 初始化服务
        travel_service = TravelService()
        
        # 生成路线
        result = travel_service.generate_itinerary(
            travel_plan_id=travel_plan_id,
            start_date=start,
            end_date=end,
            destination=plan["destination"],
            interests=plan.get("interests", []),
            food_preferences=plan.get("food_preferences", []),
            travelers=plan.get("travelers", ""),
            budget_min=float(plan.get("budget_min", 0)),
            budget_max=float(plan.get("budget_max", 10000)),
            xiaohongshu_notes=plan.get("xiaohongshu_notes", [])
        )
        
        return result
        
    except Exception as e:
        # 任务失败时更新状态
        return {
            "success": False,
            "error": str(e),
            "task_id": self.request.id
        }


@celery_app.task(name="fetch_attractions", bind=True)
def fetch_attractions_task(
    self,
    destination: str,
    keyword: str = None
) -> Dict[str, Any]:
    """
    异步获取景点信息任务
    
    Args:
        destination: 目的地
        keyword: 搜索关键词
    
    Returns:
        景点列表
    """
    try:
        from app.utils.api_clients import LocationAPIClient
        
        client = LocationAPIClient()
        attractions = client.search_attractions(destination, keyword)
        
        # 保存到数据库
        saved_count = 0
        for attr in attractions:
            attr_id = travel_crud.create_attraction(
                name=attr.get("name", ""),
                address=attr.get("address"),
                description=attr.get("description"),
                image_url=attr.get("image_url"),
                latitude=attr.get("latitude"),
                longitude=attr.get("longitude"),
                city=destination
            )
            if attr_id:
                saved_count += 1
        
        return {
            "success": True,
            "attractions": attractions,
            "saved_count": saved_count
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@celery_app.task(name="fetch_restaurants", bind=True)
def fetch_restaurants_task(
    self,
    destination: str,
    cuisine_type: str = None
) -> Dict[str, Any]:
    """
    异步获取餐厅信息任务
    
    Args:
        destination: 目的地
        cuisine_type: 菜系类型
    
    Returns:
        餐厅列表
    """
    try:
        from app.utils.api_clients import LocationAPIClient
        
        client = LocationAPIClient()
        restaurants = client.search_restaurants(destination, cuisine_type)
        
        # 保存到数据库
        saved_count = 0
        for rest in restaurants:
            rest_id = travel_crud.create_restaurant(
                name=rest.get("name", ""),
                address=rest.get("address"),
                description=rest.get("description"),
                image_url=rest.get("image_url"),
                latitude=rest.get("latitude"),
                longitude=rest.get("longitude"),
                city=destination,
                cuisine_type=cuisine_type
            )
            if rest_id:
                saved_count += 1
        
        return {
            "success": True,
            "restaurants": restaurants,
            "saved_count": saved_count
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
