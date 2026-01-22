"""
Function Calling 执行器
提供统一的函数调用接口，包括参数验证、错误处理、重试机制和缓存
"""

import json
import time
import hashlib
from typing import Dict, Any, Optional, Callable
from functools import wraps, lru_cache
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import requests
from app.utils.function_schemas import (
    validate_function_args,
    get_function_schema,
    FUNCTION_SCHEMA_MAP
)
from app.utils.api_clients import LocationAPIClient, XiaohongshuClient


class FunctionExecutionError(Exception):
    """函数执行错误"""
    pass


class FunctionValidationError(Exception):
    """函数参数验证错误"""
    pass


# ==================== 缓存装饰器 ====================

def cached_function_call(ttl: int = 3600):
    """
    缓存函数调用结果（基于参数哈希）
    
    Args:
        ttl: 缓存有效期（秒），默认1小时
    """
    cache = {}
    
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = hashlib.md5(
                json.dumps({
                    "func": func.__name__,
                    "args": args,
                    "kwargs": kwargs
                }, sort_keys=True).encode()
            ).hexdigest()
            
            # 检查缓存
            if cache_key in cache:
                cached_result, cached_time = cache[cache_key]
                if time.time() - cached_time < ttl:
                    return cached_result
                else:
                    del cache[cache_key]
            
            # 执行函数
            result = func(*args, **kwargs)
            
            # 存储到缓存
            cache[cache_key] = (result, time.time())
            
            return result
        
        return wrapper
    return decorator


# ==================== 重试装饰器 ====================

def retry_on_network_error(max_attempts: int = 3):
    """网络请求重试装饰器"""
    def decorator(func: Callable):
        @retry(
            stop=stop_after_attempt(max_attempts),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type((requests.RequestException, ConnectionError))
        )
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    return decorator


# ==================== 函数实现 ====================

class FunctionExecutor:
    """函数执行器，统一管理所有可调用函数"""
    
    def __init__(self):
        self.location_client = LocationAPIClient()
        self.xiaohongshu_client = XiaohongshuClient()
        self._function_map = {
            "geocode": self._execute_geocode,
            "search_attractions": self._execute_search_attractions,
            "search_restaurants": self._execute_search_restaurants,
            "search_places": self._execute_search_places,
            "get_xiaohongshu_cdata": self._execute_get_xiaohongshu_cdata,
        }
    
    def execute(self, function_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行函数调用
        
        Args:
            function_name: 函数名称
            arguments: 函数参数（字典格式）
        
        Returns:
            函数执行结果
        
        Raises:
            FunctionValidationError: 参数验证失败
            FunctionExecutionError: 函数执行失败
        """
        # 1. 验证函数是否存在
        if function_name not in self._function_map:
            raise FunctionValidationError(f"未知的函数：{function_name}")
        
        # 2. 验证参数
        is_valid, error_msg = validate_function_args(function_name, arguments)
        if not is_valid:
            raise FunctionValidationError(error_msg)
        
        # 3. 执行函数
        try:
            func = self._function_map[function_name]
            result = func(**arguments)
            
            # 4. 标准化返回格式
            return self._format_result(result, function_name)
        
        except Exception as e:
            raise FunctionExecutionError(f"执行函数 {function_name} 失败：{str(e)}")
    
    def _format_result(self, result: Any, function_name: str) -> Dict[str, Any]:
        """标准化返回格式"""
        if result is None:
            return {
                "success": False,
                "data": None,
                "error": "函数返回空结果"
            }
        
        if isinstance(result, dict):
            # 如果已经是字典，添加 success 字段
            if "success" not in result:
                result["success"] = True
            return result
        elif isinstance(result, list):
            return {
                "success": True,
                "data": result,
                "count": len(result)
            }
        else:
            return {
                "success": True,
                "data": result
            }
    
    # ==================== 具体函数实现 ====================
    
    @cached_function_call(ttl=3600)  # 缓存1小时
    @retry_on_network_error(max_attempts=3)
    def _execute_geocode(self, address: str, location: Optional[str] = None) -> Dict[str, Any]:
        """执行地理编码"""
        if not address or not address.strip():
            raise ValueError("地址不能为空")
        
        result = self.location_client.geocode(address, location=location)
        if not result:
            return {
                "success": False,
                "data": None,
                "error": f"无法解析地址：{address}"
            }
        
        return {
            "success": True,
            "data": result
        }
    
    @cached_function_call(ttl=1800)  # 缓存30分钟
    @retry_on_network_error(max_attempts=3)
    def _execute_search_attractions(self, city: str, keyword: Optional[str] = None) -> Dict[str, Any]:
        """执行景点搜索"""
        if not city or not city.strip():
            raise ValueError("城市名称不能为空")
        
        results = self.location_client.search_attractions(city, keyword)
        return {
            "success": True,
            "data": results,
            "count": len(results) if results else 0
        }
    
    @cached_function_call(ttl=1800)  # 缓存30分钟
    @retry_on_network_error(max_attempts=3)
    def _execute_search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> Dict[str, Any]:
        """执行餐厅搜索"""
        if not city or not city.strip():
            raise ValueError("城市名称不能为空")
        
        results = self.location_client.search_restaurants(city, cuisine_type)
        return {
            "success": True,
            "data": results,
            "count": len(results) if results else 0
        }
    
    @cached_function_call(ttl=1800)  # 缓存30分钟
    @retry_on_network_error(max_attempts=3)
    def _execute_search_places(self, keywords: str, city: Optional[str] = None, types: Optional[str] = None) -> Dict[str, Any]:
        """执行通用地点搜索"""
        if not keywords or not keywords.strip():
            raise ValueError("搜索关键词不能为空")
        
        # 使用高德地图的 search_places 方法
        # LocationAPIClient 内部有 amap_client，可以直接调用
        amap_client = self.location_client.amap_client
        results = amap_client.search_places(
            keywords=keywords,
            city=city,
            types=types
        )
        
        return {
            "success": True,
            "data": results,
            "count": len(results) if results else 0
        }
    
    @cached_function_call(ttl=7200)  # 缓存2小时（小红书内容变化较少）
    @retry_on_network_error(max_attempts=3)
    def _execute_get_xiaohongshu_cdata(self, note_url: str) -> Dict[str, Any]:
        """执行获取小红书CDATA"""
        if not note_url or not note_url.strip():
            raise ValueError("笔记URL不能为空")
        
        result = self.xiaohongshu_client.get_note_cdata(note_url)
        if not result:
            return {
                "success": False,
                "data": None,
                "error": f"无法获取小红书笔记：{note_url}"
            }
        
        return {
            "success": True,
            "data": result
        }


# ==================== 全局执行器实例 ====================

_executor = None

def get_executor() -> FunctionExecutor:
    """获取全局函数执行器实例（单例模式）"""
    global _executor
    if _executor is None:
        _executor = FunctionExecutor()
    return _executor
