import requests
import hashlib
import hmac
import time
from typing import List, Dict, Optional, Any
from urllib.parse import quote
from app.config import settings


# ==================== 高德地图 API 客户端 ====================

class AmapClient:
    """高德地图API客户端（用于国内地点）"""
    
    def __init__(self):
        self.api_key = settings.AMAP_API_KEY
        self.security_key = settings.AMAP_SECURITY_KEY
        self.base_url = "https://restapi.amap.com/v3"
    
    def _sign_request(self, params: Dict[str, Any]) -> str:
        """生成高德地图API签名"""
        # 移除sign和key参数
        sign_params = {k: v for k, v in params.items() if k not in ['sign', 'key']}
        # 按key排序
        sorted_params = sorted(sign_params.items())
        # 拼接字符串
        query_string = '&'.join([f"{k}={v}" for k, v in sorted_params])
        # 添加安全密钥
        query_string += f"&key={self.api_key}"
        # 计算MD5
        sign = hashlib.md5(query_string.encode('utf-8')).hexdigest()
        return sign
    
    def geocode(self, address: str) -> Optional[Dict[str, Any]]:
        """地理编码：将地址转换为经纬度"""
        url = f"{self.base_url}/geocode/geo"
        params = {
            "key": self.api_key,
            "address": address,
            "output": "json"
        }
        params["sig"] = self._sign_request(params)
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "1" and data.get("geocodes"):
                geocode = data["geocodes"][0]
                location = geocode.get("location", "").split(",")
                return {
                    "latitude": float(location[1]) if len(location) > 1 else None,
                    "longitude": float(location[0]) if len(location) > 0 else None,
                    "formatted_address": geocode.get("formatted_address"),
                    "province": geocode.get("province"),
                    "city": geocode.get("city"),
                    "district": geocode.get("district")
                }
        except Exception as e:
            print(f"❌ 高德地理编码失败：{e}")
        
        return None
    
    def search_places(
        self,
        keywords: str,
        city: Optional[str] = None,
        types: Optional[str] = None,
        page: int = 1,
        offset: int = 20
    ) -> List[Dict[str, Any]]:
        """搜索地点（景点、餐厅等）"""
        url = f"{self.base_url}/place/text"
        params = {
            "key": self.api_key,
            "keywords": keywords,
            "output": "json",
            "page": page,
            "offset": offset
        }
        
        if city:
            params["city"] = city
        if types:
            params["types"] = types
        
        params["sig"] = self._sign_request(params)
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "1" and data.get("pois"):
                results = []
                for poi in data["pois"]:
                    location = poi.get("location", "").split(",")
                    results.append({
                        "name": poi.get("name"),
                        "address": poi.get("address"),
                        "latitude": float(location[1]) if len(location) > 1 else None,
                        "longitude": float(location[0]) if len(location) > 0 else None,
                        "type": poi.get("type"),
                        "tel": poi.get("tel"),
                        "distance": poi.get("distance")
                    })
                return results
        except Exception as e:
            print(f"❌ 高德搜索地点失败：{e}")
        
        return []
    
    def search_attractions(self, city: str, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索景点"""
        keywords = keyword if keyword else "景点"
        return self.search_places(keywords=keywords, city=city, types="110000")  # 110000=风景名胜
    
    def search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索餐厅"""
        keywords = cuisine_type if cuisine_type else "餐厅"
        return self.search_places(keywords=keywords, city=city, types="050000")  # 050000=餐饮服务


# ==================== Google Places API 客户端 ====================

class GooglePlacesClient:
    """Google Places API客户端（用于国外地点）"""
    
    def __init__(self):
        self.api_key = settings.GOOGLE_PLACES_API_KEY
        self.base_url = "https://maps.googleapis.com/maps/api/place"
    
    def is_available(self) -> bool:
        """检查Google Places API是否可用"""
        return self.api_key is not None
    
    def geocode(self, address: str) -> Optional[Dict[str, Any]]:
        """地理编码"""
        if not self.is_available():
            return None
        
        url = f"{self.base_url}/geocode/json"
        params = {
            "address": address,
            "key": self.api_key
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
                location = result["geometry"]["location"]
                return {
                    "latitude": location.get("lat"),
                    "longitude": location.get("lng"),
                    "formatted_address": result.get("formatted_address"),
                    "place_id": result.get("place_id")
                }
        except Exception as e:
            print(f"❌ Google地理编码失败：{e}")
        
        return None
    
    def search_places(
        self,
        query: str,
        location: Optional[str] = None,
        type: Optional[str] = None,
        radius: int = 5000
    ) -> List[Dict[str, Any]]:
        """搜索地点"""
        if not self.is_available():
            return []
        
        url = f"{self.base_url}/textsearch/json"
        params = {
            "query": query,
            "key": self.api_key
        }
        
        if location:
            params["location"] = location
        if type:
            params["type"] = type
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                results = []
                for place in data["results"]:
                    location = place.get("geometry", {}).get("location", {})
                    results.append({
                        "name": place.get("name"),
                        "address": place.get("formatted_address"),
                        "latitude": location.get("lat"),
                        "longitude": location.get("lng"),
                        "place_id": place.get("place_id"),
                        "rating": place.get("rating"),
                        "types": place.get("types", [])
                    })
                return results
        except Exception as e:
            print(f"❌ Google搜索地点失败：{e}")
        
        return []
    
    def search_attractions(self, city: str, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索景点"""
        query = f"{keyword} {city}" if keyword else f"attractions {city}"
        return self.search_places(query=query, type="tourist_attraction")
    
    def search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索餐厅"""
        query = f"{cuisine_type} restaurant {city}" if cuisine_type else f"restaurant {city}"
        return self.search_places(query=query, type="restaurant")


# ==================== 小红书 API 客户端 ====================

class XiaohongshuClient:
    """小红书API客户端（用于获取笔记内容）"""
    
    def __init__(self):
        self.base_url = "https://edith.xiaohongshu.com"
    
    def extract_note_id(self, url: str) -> Optional[str]:
        """从小红书链接中提取笔记ID"""
        # 小红书链接格式：http://xhslink.com/o/xxxxx
        # 或者：https://www.xiaohongshu.com/explore/xxxxx
        try:
            if "xhslink.com" in url:
                # 需要解析短链接，这里简化处理
                parts = url.split("/")
                if len(parts) > 0:
                    return parts[-1]
            elif "xiaohongshu.com" in url:
                parts = url.split("/")
                if "explore" in parts:
                    idx = parts.index("explore")
                    if idx + 1 < len(parts):
                        return parts[idx + 1]
        except Exception as e:
            print(f"❌ 提取小红书笔记ID失败：{e}")
        
        return None
    
    def get_note_content(self, note_url: str) -> Optional[Dict[str, Any]]:
        """获取小红书笔记内容（需要实际的小红书API，这里返回模拟数据）"""
        # 注意：小红书API通常需要认证，这里提供基础结构
        # 实际使用时需要根据小红书官方API文档实现
        
        note_id = self.extract_note_id(note_url)
        if not note_id:
            return None
        
        # 模拟返回数据
        return {
            "note_id": note_id,
            "title": "旅行攻略",
            "content": "这是一篇关于旅行的笔记...",
            "images": [],
            "tags": []
        }


# ==================== 地点判断工具 ====================

def is_domestic_location(location: str) -> bool:
    """判断是否为国内地点"""
    # 简单判断：明确的国外关键词直接判定为国外（避免把首尔/东京误判为国内导致高德不可用）
    foreign_keywords = ["首尔", "东京", "大阪", "新加坡", "曼谷", "吉隆坡", "雅加达", "巴黎", "纽约", "伦敦", "悉尼", "墨尔本"]
    for k in foreign_keywords:
        if k in location:
            return False

    # 简单的国内城市判断（实际应该更完善）
    domestic_keywords = [
        "北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "西安",
        "南京", "武汉", "天津", "苏州", "长沙", "郑州", "青岛", "大连",
        "厦门", "昆明", "哈尔滨", "沈阳", "济南", "福州", "石家庄", "南昌",
        "合肥", "太原", "长春", "贵阳", "海口", "兰州", "银川", "西宁",
        "乌鲁木齐", "拉萨", "呼和浩特", "香港", "澳门", "台湾", "台北"
    ]
    
    # 如果包含国内关键词，判断为国内
    for keyword in domestic_keywords:
        if keyword in location:
            return True
    
    return False


# ==================== 统一API客户端 ====================

class LocationAPIClient:
    """统一的地点API客户端，自动选择国内/国外API"""
    
    def __init__(self):
        self.amap_client = AmapClient()
        self.google_client = GooglePlacesClient()
    
    def geocode(self, address: str, location: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """地理编码"""
        is_domestic = is_domestic_location(address) if not location else is_domestic_location(location)
        
        if is_domestic:
            return self.amap_client.geocode(address)
        else:
            return self.google_client.geocode(address)
    
    def search_attractions(self, city: str, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索景点"""
        is_domestic = is_domestic_location(city)
        
        if is_domestic:
            return self.amap_client.search_attractions(city, keyword)
        else:
            return self.google_client.search_attractions(city, keyword)
    
    def search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索餐厅"""
        is_domestic = is_domestic_location(city)
        
        if is_domestic:
            return self.amap_client.search_restaurants(city, cuisine_type)
        else:
            return self.google_client.search_restaurants(city, cuisine_type)
