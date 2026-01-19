from typing import Optional, Dict, Any
from langchain_core.tools import tool
from app.utils.api_clients import LocationAPIClient


@tool
def geocode_tool(address: str, location: Optional[str] = None) -> Dict[str, Any]:
    """
    根据地址查询经纬度（自动选择高德/Google）。

    输入:
    - address: 需要解析的地址/地点名称
    - location: 目的地城市（可选，用于更准确解析）

    输出:
    - latitude: 纬度
    - longitude: 经度
    - formatted_address: 标准化地址（若有）
    """
    client = LocationAPIClient()
    result = client.geocode(address, location=location)
    if not result:
        return {"latitude": None, "longitude": None, "formatted_address": None}
    return result

