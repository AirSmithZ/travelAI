"""
标准的 Function Calling Schema 定义
基于 OpenAI Function Calling 规范，用于定义所有可用的工具函数
"""

from typing import List, Dict, Any, Optional

# ==================== 地理编码相关函数 ====================

GEOCODE_FUNCTION = {
    "name": "geocode",
    "description": "根据地址或地点名称查询经纬度坐标。自动选择高德地图（国内）或Mapbox（国外）进行地理编码。",
    "parameters": {
        "type": "object",
        "properties": {
            "address": {
                "type": "string",
                "description": "需要解析的地址或地点名称，例如：'北京天安门'、'Tokyo Tower'"
            },
            "location": {
                "type": "string",
                "description": "可选，目的地城市名称，用于更准确的地理编码，例如：'北京'、'Tokyo'"
            }
        },
        "required": ["address"]
    }
}

# ==================== 地点搜索相关函数 ====================

SEARCH_ATTRACTIONS_FUNCTION = {
    "name": "search_attractions",
    "description": "搜索指定城市的景点信息。返回景点名称、地址、经纬度、类型等信息。",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "城市名称，例如：'北京'、'上海'、'Tokyo'、'Paris'"
            },
            "keyword": {
                "type": "string",
                "description": "可选，搜索关键词，用于筛选特定类型的景点，例如：'博物馆'、'公园'、'temple'"
            }
        },
        "required": ["city"]
    }
}

SEARCH_RESTAURANTS_FUNCTION = {
    "name": "search_restaurants",
    "description": "搜索指定城市的餐厅信息。返回餐厅名称、地址、经纬度、类型等信息。",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "城市名称，例如：'北京'、'上海'、'Tokyo'、'Paris'"
            },
            "cuisine_type": {
                "type": "string",
                "description": "可选，菜系类型，例如：'川菜'、'日料'、'Italian'、'French'"
            }
        },
        "required": ["city"]
    }
}

SEARCH_PLACES_FUNCTION = {
    "name": "search_places",
    "description": "通用地点搜索功能，可以搜索各种类型的地点（景点、餐厅、酒店等）。",
    "parameters": {
        "type": "object",
        "properties": {
            "keywords": {
                "type": "string",
                "description": "搜索关键词，例如：'咖啡厅'、'hotel'、'shopping mall'"
            },
            "city": {
                "type": "string",
                "description": "可选，城市名称，用于限定搜索范围"
            },
            "types": {
                "type": "string",
                "description": "可选，地点类型代码（高德地图类型代码），例如：'110000'（风景名胜）、'050000'（餐饮服务）"
            }
        },
        "required": ["keywords"]
    }
}

# ==================== 小红书相关函数 ====================

GET_XIAOHONGSHU_CDATA_FUNCTION = {
    "name": "get_xiaohongshu_cdata",
    "description": "获取小红书笔记的详细内容（CDATA数据）。用于提取旅行攻略、景点推荐、餐厅推荐等信息。支持短链接和完整链接。",
    "parameters": {
        "type": "object",
        "properties": {
            "note_url": {
                "type": "string",
                "description": "小红书笔记的URL，支持以下格式：1) 短链接：http://xhslink.com/o/xxx 2) 完整链接：https://www.xiaohongshu.com/explore/xxx 或 https://www.xiaohongshu.com/discovery/item/xxx"
            }
        },
        "required": ["note_url"]
    }
}

# ==================== 所有可用函数的列表 ====================

ALL_FUNCTIONS = [
    GEOCODE_FUNCTION,
    SEARCH_ATTRACTIONS_FUNCTION,
    SEARCH_RESTAURANTS_FUNCTION,
    SEARCH_PLACES_FUNCTION,
    GET_XIAOHONGSHU_CDATA_FUNCTION,
]

# ==================== 函数名称到 schema 的映射 ====================

FUNCTION_SCHEMA_MAP = {
    "geocode": GEOCODE_FUNCTION,
    "search_attractions": SEARCH_ATTRACTIONS_FUNCTION,
    "search_restaurants": SEARCH_RESTAURANTS_FUNCTION,
    "search_places": SEARCH_PLACES_FUNCTION,
    "get_xiaohongshu_cdata": GET_XIAOHONGSHU_CDATA_FUNCTION,
}


def get_function_schema(function_name: str) -> Optional[Dict[str, Any]]:
    """根据函数名称获取对应的 schema"""
    return FUNCTION_SCHEMA_MAP.get(function_name)


def validate_function_args(function_name: str, args: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    验证函数参数是否符合 schema 定义
    
    Returns:
        (is_valid, error_message)
    """
    schema = get_function_schema(function_name)
    if not schema:
        return False, f"未知的函数：{function_name}"
    
    params = schema.get("parameters", {})
    properties = params.get("properties", {})
    required = params.get("required", [])
    
    # 检查必需参数
    for param in required:
        if param not in args or args[param] is None:
            return False, f"缺少必需参数：{param}"
    
    # 检查参数类型（简单验证）
    for param_name, param_value in args.items():
        if param_name not in properties:
            continue  # 允许额外参数
        
        param_schema = properties[param_name]
        param_type = param_schema.get("type")
        
        if param_type == "string" and not isinstance(param_value, str):
            return False, f"参数 {param_name} 必须是字符串类型"
        elif param_type == "integer" and not isinstance(param_value, int):
            return False, f"参数 {param_name} 必须是整数类型"
        elif param_type == "number" and not isinstance(param_value, (int, float)):
            return False, f"参数 {param_name} 必须是数字类型"
        elif param_type == "boolean" and not isinstance(param_value, bool):
            return False, f"参数 {param_name} 必须是布尔类型"
        
        # 检查 enum 值
        if "enum" in param_schema:
            if param_value not in param_schema["enum"]:
                return False, f"参数 {param_name} 必须是以下值之一：{param_schema['enum']}"
    
    return True, None
