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
        
        # 如果配置了安全密钥，使用签名；否则不使用签名（适用于 Web 服务 API Key）
        if self.security_key:
            params["sig"] = self._sign_request(params)
        # 如果没有安全密钥，直接使用 key（某些类型的 API Key 不需要签名）
        
        try:
            print(f"📍 高德地理编码请求：address={address}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # 打印响应状态，便于调试
            status = data.get("status")
            info = data.get("info", "")
            count = data.get("count", 0)
            print(f"📍 高德API响应：status={status}, info={info}, count={count}")
            
            if status == "1" and data.get("geocodes"):
                geocodes = data.get("geocodes", [])
                if len(geocodes) > 0:
                    geocode = geocodes[0]
                    location_str = geocode.get("location", "")
                    if location_str:
                        location = location_str.split(",")
                        if len(location) >= 2:
                            try:
                                longitude = float(location[0])
                                latitude = float(location[1])
                                result = {
                                    "latitude": latitude,
                                    "longitude": longitude,
                                    "formatted_address": geocode.get("formatted_address"),
                                    "province": geocode.get("province"),
                                    "city": geocode.get("city"),
                                    "district": geocode.get("district")
                                }
                                print(f"✅ 高德地理编码成功：{address} -> ({latitude}, {longitude})")
                                return result
                            except (ValueError, IndexError) as e:
                                print(f"❌ 解析高德返回的经纬度失败：location={location_str}, error={e}")
                    else:
                        print(f"⚠️ 高德返回的 geocode 中没有 location 字段")
                else:
                    print(f"⚠️ 高德返回的 geocodes 数组为空")
            else:
                # 高德 API 返回了错误状态
                error_msg = f"高德API返回错误：status={status}, info={info}"
                if status == "0":
                    error_msg += f", 可能原因：API Key 无效、签名错误、或地址无法解析"
                print(f"❌ {error_msg}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ 高德地理编码网络请求失败：{e}")
        except Exception as e:
            print(f"❌ 高德地理编码失败：{e}")
            import traceback
            traceback.print_exc()
        
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
        
        # 如果配置了安全密钥，使用签名；否则不使用签名
        if self.security_key:
            params["sig"] = self._sign_request(params)
        
        try:
            print(f"🔍 高德搜索地点：keywords={keywords}, city={city}, types={types}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            status = data.get("status")
            info = data.get("info", "")
            count = data.get("count", 0)
            print(f"📍 高德搜索API响应：status={status}, info={info}, count={count}")
            
            if status == "1" and data.get("pois"):
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
                print(f"✅ 高德搜索成功：找到 {len(results)} 个结果")
                return results
            else:
                print(f"⚠️ 高德搜索返回空结果：status={status}, info={info}")
        except Exception as e:
            print(f"❌ 高德搜索地点失败：{e}")
            import traceback
            traceback.print_exc()
        
        return []
    
    def search_attractions(self, city: str, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索景点"""
        keywords = keyword if keyword else "景点"
        return self.search_places(keywords=keywords, city=city, types="110000")  # 110000=风景名胜
    
    def search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索餐厅"""
        keywords = cuisine_type if cuisine_type else "餐厅"
        return self.search_places(keywords=keywords, city=city, types="050000")  # 050000=餐饮服务


# ==================== Mapbox Geocoding API 客户端 ====================

class MapboxGeocodingClient:
    """Mapbox Geocoding API客户端（用于国外地点，替代Google）"""
    
    def __init__(self):
        # 从 settings 读取 Mapbox Token
        self.access_token = getattr(settings, 'MAPBOX_TOKEN', None)
        self.base_url = "https://api.mapbox.com/geocoding/v5"
    
    def is_available(self) -> bool:
        """检查Mapbox API是否可用"""
        return self.access_token is not None and self.access_token.strip() != ""
    
    def geocode(self, address: str) -> Optional[Dict[str, Any]]:
        """地理编码：将地址转换为经纬度"""
        if not self.is_available():
            print("⚠️ Mapbox Token 未配置，无法使用地理编码")
            return None
        
        # Mapbox Geocoding API: forward geocoding
        # 对于中文地址，添加国家/地区限定以提高准确性
        # 如果地址包含明确的国内城市关键词，添加 country=CN 限定
        from app.utils.api_clients import is_domestic_location
        is_domestic = is_domestic_location(address)
        country_code = "CN" if is_domestic else None
        
        # 对于国内地址，使用更精确的查询方式
        # Mapbox 对中文支持有限，尝试使用英文城市名或添加更多限定
        query_address = address
        if is_domestic:
            # 国内城市中英文映射
            city_mapping = {
                "成都": "Chengdu",
                "北京": "Beijing",
                "上海": "Shanghai",
                "广州": "Guangzhou",
                "深圳": "Shenzhen",
                "杭州": "Hangzhou",
            }
            for cn_name, en_name in city_mapping.items():
                if cn_name in address:
                    query_address = en_name
                    break
        
        url = f"{self.base_url}/mapbox.places/{quote(query_address)}.json"
        params = {
            "access_token": self.access_token,
            "limit": 5  # 增加返回数量，便于筛选
        }
        
        # 如果是国内地址，添加国家限定
        if country_code:
            params["country"] = country_code
        
        try:
            print(f"📍 Mapbox地理编码请求：address={address}, query_address={query_address}, country={country_code}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("features") and len(data["features"]) > 0:
                # 对于国内地址，优先选择中国的结果
                features = data.get("features", [])
                selected_feature = None
                
                if is_domestic:
                    # 查找包含 "China" 或 "CN" 的结果
                    for feature in features:
                        context = feature.get("context", [])
                        place_name = feature.get("place_name", "").lower()
                        # 检查是否是中国
                        is_china = any(
                            ctx.get("id", "").startswith("country") and "cn" in ctx.get("short_code", "").lower()
                            for ctx in context
                        ) or "china" in place_name or "中国" in place_name
                        
                        if is_china:
                            selected_feature = feature
                            break
                    
                    # 如果没找到明确的中国结果，使用第一个
                    if not selected_feature and features:
                        selected_feature = features[0]
                        print(f"⚠️ Mapbox未找到明确的中国结果，使用第一个结果")
                else:
                    selected_feature = features[0]
                
                if selected_feature:
                    coordinates = selected_feature.get("geometry", {}).get("coordinates", [])
                    if len(coordinates) >= 2:
                        result = {
                            "latitude": float(coordinates[1]),
                            "longitude": float(coordinates[0]),
                            "formatted_address": selected_feature.get("place_name"),
                            "place_id": selected_feature.get("id")
                        }
                        print(f"✅ Mapbox地理编码成功：{address} -> ({result['latitude']}, {result['longitude']}) - {result['formatted_address']}")
                        return result
            else:
                print(f"⚠️ Mapbox未找到匹配结果：{address}")
        except Exception as e:
            print(f"❌ Mapbox地理编码失败：{e}")
            import traceback
            traceback.print_exc()
        
        return None


# ==================== Google Places API 客户端（保留作为备选）===================

class GooglePlacesClient:
    """Google Places API客户端（用于国外地点，已弃用，改用Mapbox）"""
    
    def __init__(self):
        self.api_key = settings.GOOGLE_PLACES_API_KEY
        self.base_url = "https://maps.googleapis.com/maps/api"
    
    def is_available(self) -> bool:
        """检查Google Places API是否可用"""
        return self.api_key is not None and self.api_key.strip() != ""
    
    def geocode(self, address: str) -> Optional[Dict[str, Any]]:
        """地理编码（使用正确的Google Geocoding API URL）"""
        if not self.is_available():
            return None
        
        # 使用正确的 Google Geocoding API URL（不是 /place/geocode）
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
    if not location:
        return True  # 默认判断为国内
    
    location_lower = location.lower()
    
    # 简单判断：明确的国外关键词直接判定为国外（避免把首尔/东京误判为国内导致高德不可用）
    foreign_keywords = [
        "首尔", "东京", "大阪", "新加坡", "曼谷", "吉隆坡", "雅加达", 
        "巴黎", "纽约", "伦敦", "悉尼", "墨尔本", "seoul", "tokyo", 
        "singapore", "bangkok", "kuala lumpur", "paris", "new york", 
        "london", "sydney", "melbourne"
    ]
    for k in foreign_keywords:
        if k.lower() in location_lower:
            return False

    # 简单的国内城市判断（实际应该更完善）
    domestic_keywords = [
        "北京", "上海", "广州", "深圳", "杭州", "成都", "重庆", "西安",
        "南京", "武汉", "天津", "苏州", "长沙", "郑州", "青岛", "大连",
        "厦门", "昆明", "哈尔滨", "沈阳", "济南", "福州", "石家庄", "南昌",
        "合肥", "太原", "长春", "贵阳", "海口", "兰州", "银川", "西宁",
        "乌鲁木齐", "拉萨", "呼和浩特", "香港", "澳门", "台湾", "台北",
        "beijing", "shanghai", "guangzhou", "shenzhen", "hangzhou", "chengdu"
    ]
    
    # 如果包含国内关键词，判断为国内
    for keyword in domestic_keywords:
        if keyword.lower() in location_lower:
            return True
    
    # 默认判断为国内（因为高德地图主要支持国内）
    return True


# ==================== 统一API客户端 ====================

class LocationAPIClient:
    """统一的地点API客户端，自动选择国内/国外API"""
    
    def __init__(self):
        self.amap_client = AmapClient()
        self.mapbox_client = MapboxGeocodingClient()
        self.google_client = GooglePlacesClient()  # 保留作为备选
    
    def geocode(self, address: str, location: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """地理编码：优先使用高德（国内）或Mapbox（国外）"""
        is_domestic = is_domestic_location(address) if not location else is_domestic_location(location)
        
        print(f"🌍 地理编码请求：address={address}, location={location}, is_domestic={is_domestic}")
        
        if is_domestic:
            # 国内使用高德
            result = self.amap_client.geocode(address)
            if not result:
                print(f"⚠️ 高德地理编码失败，尝试使用 Mapbox 作为备选")
                # 如果高德失败，尝试使用 Mapbox（某些情况下可能更准确）
                result = self.mapbox_client.geocode(address)
            return result
        else:
            # 国外优先使用 Mapbox，如果不可用则尝试 Google
            result = self.mapbox_client.geocode(address)
            if result:
                return result
            # Mapbox 不可用时，尝试 Google（如果配置了）
            return self.google_client.geocode(address)
    
    def search_attractions(self, city: str, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索景点"""
        is_domestic = is_domestic_location(city)
        
        if is_domestic:
            return self.amap_client.search_attractions(city, keyword)
        else:
            # 国外暂时使用 Google（Mapbox 主要提供地理编码，搜索功能需要 Places API）
            return self.google_client.search_attractions(city, keyword)
    
    def search_restaurants(self, city: str, cuisine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """搜索餐厅"""
        is_domestic = is_domestic_location(city)
        
        if is_domestic:
            return self.amap_client.search_restaurants(city, cuisine_type)
        else:
            # 国外暂时使用 Google（Mapbox 主要提供地理编码，搜索功能需要 Places API）
            return self.google_client.search_restaurants(city, cuisine_type)
