from typing import Optional, Dict, Any
from langchain_core.tools import tool
from app.utils.api_clients import LocationAPIClient, XiaohongshuClient


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


@tool
def get_xiaohongshu_cdata(note_url: str) -> Dict[str, Any]:
    """
    获取小红书笔记的CDATA内容（作为知识库使用）。
    这个工具用于从小红书链接中提取详细的笔记信息，包括：
    - 标题和正文内容
    - 推荐的景点、餐厅、住宿
    - 旅行 tips 和注意事项
    - 标签和话题信息
    
    输入:
    - note_url: 小红书笔记的完整URL（支持 xhslink.com 短链接或 xiaohongshu.com 完整链接）
    
    输出:
    - note_id: 笔记ID
    - title: 笔记标题
    - content: 笔记正文内容
    - cdata: 结构化的CDATA数据，包含推荐信息、标签等
    - raw_content: 完整的原始内容
    
    注意：这个工具返回的数据将作为生成旅行路线的重要参考依据。
    """
    client = XiaohongshuClient()
    result = client.get_note_cdata(note_url)
    if not result:
        return {
            "note_id": None,
            "title": None,
            "content": None,
            "cdata": None,
            "raw_content": None,
            "error": "无法获取小红书笔记CDATA"
        }
    return result

