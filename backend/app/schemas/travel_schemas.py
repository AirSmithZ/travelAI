from pydantic import BaseModel, Field
from pydantic import ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, date


# ==================== 基础 Schema ====================

class BudgetSchema(BaseModel):
    min: float = Field(default=0, ge=0, description="预算下限")
    max: float = Field(default=10000, ge=0, description="预算上限")


class AddressSchema(BaseModel):
    city: str = Field(..., description="城市")
    address: str = Field(..., description="地址")
    check_in_date: Optional[date] = Field(None, alias="checkInDate", description="入住日期")
    check_out_date: Optional[date] = Field(None, alias="checkOutDate", description="退房日期")


class FlightSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    departure_airport: str = Field(..., alias="departureAirport", description="出发机场")
    arrival_airport: str = Field(..., alias="arrivalAirport", description="到达机场")
    departure_time: datetime = Field(..., alias="departureTime", description="出发时间")
    return_time: Optional[datetime] = Field(None, alias="returnTime", description="返回时间")


# ==================== 请求 Schema ====================

class TravelPlanCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    destination: List[str] = Field(..., description="目的地列表")
    budget: BudgetSchema = Field(..., description="预算范围")
    interests: List[str] = Field(default=[], description="旅行偏好")
    food_preferences: List[str] = Field(default=[], alias="foodPreferences", description="饮食偏好")
    travelers: str = Field(..., description="出行人数及类型")
    xiaohongshu_notes: List[str] = Field(default=[], alias="xiaohongshuNotes", description="小红书笔记链接")
    addresses: List[AddressSchema] = Field(default=[], description="居住地址信息")
    flights: List[FlightSchema] = Field(default=[], description="航班信息")


class ConversationCreate(BaseModel):
    travel_plan_id: int = Field(..., description="旅行规划ID")
    message: str = Field(..., description="对话内容")
    sender: str = Field(..., pattern="^(user|system)$", description="发送者类型")


# ==================== 响应 Schema ====================

class TravelPlanResponse(BaseModel):
    id: int
    user_id: int
    destination: str
    budget_min: float
    budget_max: float
    interests: Optional[List[str]]
    food_preferences: Optional[List[str]]
    travelers: Optional[str]
    xiaohongshu_notes: Optional[List[str]]
    addresses: Optional[List[Dict[str, Any]]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    user_id: int
    travel_plan_id: Optional[int]
    message: str
    sender: str
    timestamp: datetime

    class Config:
        from_attributes = True


class ItineraryDetailResponse(BaseModel):
    id: int
    travel_plan_id: int
    day_number: int
    itinerary: Optional[Dict[str, Any]]
    recommended_spots: Optional[List[Dict[str, Any]]]
    recommended_restaurants: Optional[List[Dict[str, Any]]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AttractionResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    description: Optional[str]
    image_url: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    country: Optional[str]

    class Config:
        from_attributes = True


class RestaurantResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    description: Optional[str]
    image_url: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    country: Optional[str]
    cuisine_type: Optional[str]
    price_level: Optional[str]

    class Config:
        from_attributes = True


class FlightResponse(BaseModel):
    id: int
    user_id: int
    travel_plan_id: Optional[int]
    departure_airport: str
    arrival_airport: str
    departure_time: datetime
    return_time: Optional[datetime]
    latitude: Optional[float]
    longitude: Optional[float]

    class Config:
        from_attributes = True


class AccommodationResponse(BaseModel):
    id: int
    user_id: int
    travel_plan_id: Optional[int]
    city: str
    address: str
    latitude: Optional[float]
    longitude: Optional[float]

    class Config:
        from_attributes = True


# ==================== AI 生成路线请求 Schema ====================

class GenerateItineraryRequest(BaseModel):
    travel_plan_id: int = Field(..., description="旅行规划ID")
    start_date: date = Field(..., description="出发日期")
    end_date: date = Field(..., description="结束日期")


class ItineraryGenerationResponse(BaseModel):
    task_id: str = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态")
    message: str = Field(..., description="响应消息")
