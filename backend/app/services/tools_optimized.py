"""
优化后的工具定义
使用标准的 function calling schema 和统一的执行器
"""

from typing import Optional, Dict, Any
from langchain_core.tools import tool, StructuredTool
from pydantic import BaseModel, Field
from app.utils.function_executor import get_executor, FunctionExecutionError, FunctionValidationError
from app.utils.function_schemas import ALL_FUNCTIONS


# ==================== Pydantic 模型定义（用于类型验证）====================

class GeocodeInput(BaseModel):
    """地理编码输入参数"""
    address: str = Field(description="需要解析的地址或地点名称")
    location: Optional[str] = Field(default=None, description="可选，目的地城市名称")


class SearchAttractionsInput(BaseModel):
    """搜索景点输入参数"""
    city: str = Field(description="城市名称")
    keyword: Optional[str] = Field(default=None, description="可选，搜索关键词")


class SearchRestaurantsInput(BaseModel):
    """搜索餐厅输入参数"""
    city: str = Field(description="城市名称")
    cuisine_type: Optional[str] = Field(default=None, description="可选，菜系类型")


class SearchPlacesInput(BaseModel):
    """搜索地点输入参数"""
    keywords: str = Field(description="搜索关键词")
    city: Optional[str] = Field(default=None, description="可选，城市名称")
    types: Optional[str] = Field(default=None, description="可选，地点类型代码")


class GetXiaohongshuCdataInput(BaseModel):
    """获取小红书CDATA输入参数"""
    note_url: str = Field(description="小红书笔记的URL")


# ==================== 工具函数定义 ====================

@tool
def geocode_tool(address: str, location: Optional[str] = None) -> Dict[str, Any]:
    """
    根据地址查询经纬度（自动选择高德/Mapbox）。
    
    这个工具用于将地址或地点名称转换为经纬度坐标，支持国内和国外地点。
    国内地点使用高德地图，国外地点使用Mapbox。
    
    Args:
        address: 需要解析的地址/地点名称
        location: 可选，目的地城市（用于更准确解析）
    
    Returns:
        包含 latitude, longitude, formatted_address 的字典
    """
    executor = get_executor()
    try:
        result = executor.execute("geocode", {
            "address": address,
            "location": location
        })
        return result.get("data", {}) if result.get("success") else {
            "latitude": None,
            "longitude": None,
            "formatted_address": None,
            "error": result.get("error", "地理编码失败")
        }
    except (FunctionExecutionError, FunctionValidationError) as e:
        return {
            "latitude": None,
            "longitude": None,
            "formatted_address": None,
            "error": str(e)
        }


@tool
def search_attractions_tool(city: str, keyword: Optional[str] = None) -> Dict[str, Any]:
    """
    搜索指定城市的景点信息。
    
    这个工具用于查找指定城市的景点，返回景点名称、地址、经纬度等信息。
    
    Args:
        city: 城市名称
        keyword: 可选，搜索关键词（用于筛选特定类型的景点）
    
    Returns:
        包含景点列表的字典，每个景点包含 name, address, latitude, longitude 等字段
    """
    executor = get_executor()
    try:
        result = executor.execute("search_attractions", {
            "city": city,
            "keyword": keyword
        })
        return result if result.get("success") else {
            "data": [],
            "count": 0,
            "error": result.get("error", "搜索景点失败")
        }
    except (FunctionExecutionError, FunctionValidationError) as e:
        return {
            "data": [],
            "count": 0,
            "error": str(e)
        }


@tool
def search_restaurants_tool(city: str, cuisine_type: Optional[str] = None) -> Dict[str, Any]:
    """
    搜索指定城市的餐厅信息。
    
    这个工具用于查找指定城市的餐厅，返回餐厅名称、地址、经纬度等信息。
    
    Args:
        city: 城市名称
        cuisine_type: 可选，菜系类型（例如：川菜、日料）
    
    Returns:
        包含餐厅列表的字典，每个餐厅包含 name, address, latitude, longitude 等字段
    """
    executor = get_executor()
    try:
        result = executor.execute("search_restaurants", {
            "city": city,
            "cuisine_type": cuisine_type
        })
        return result if result.get("success") else {
            "data": [],
            "count": 0,
            "error": result.get("error", "搜索餐厅失败")
        }
    except (FunctionExecutionError, FunctionValidationError) as e:
        return {
            "data": [],
            "count": 0,
            "error": str(e)
        }


@tool
def get_xiaohongshu_cdata_tool(note_url: str) -> Dict[str, Any]:
    """
    获取小红书笔记的CDATA内容（作为知识库使用）。
    
    这个工具用于从小红书链接中提取详细的笔记信息，包括：
    - 标题和正文内容
    - 推荐的景点、餐厅、住宿
    - 旅行 tips 和注意事项
    - 标签和话题信息
    
    支持短链接（xhslink.com）和完整链接（xiaohongshu.com）。
    
    Args:
        note_url: 小红书笔记的完整URL
    
    Returns:
        包含 note_id, title, content, cdata 等字段的字典
    """
    executor = get_executor()
    try:
        result = executor.execute("get_xiaohongshu_cdata", {
            "note_url": note_url
        })
        return result.get("data", {}) if result.get("success") else {
            "note_id": None,
            "title": None,
            "content": None,
            "cdata": None,
            "error": result.get("error", "无法获取小红书笔记CDATA")
        }
    except (FunctionExecutionError, FunctionValidationError) as e:
        return {
            "note_id": None,
            "title": None,
            "content": None,
            "cdata": None,
            "error": str(e)
        }


# ==================== 所有可用工具列表 ====================

ALL_TOOLS = [
    geocode_tool,
    search_attractions_tool,
    search_restaurants_tool,
    get_xiaohongshu_cdata_tool,
]


# ==================== 导出 OpenAI Function Calling Schema ====================

def get_openai_function_schemas() -> list:
    """
    获取所有函数的 OpenAI Function Calling Schema
    用于直接传递给 OpenAI API
    """
    from app.utils.function_schemas import ALL_FUNCTIONS
    return ALL_FUNCTIONS
