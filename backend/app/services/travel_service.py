from typing import List, Dict, Optional, Any
from datetime import date
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from app.config import settings
from app.utils.api_clients import LocationAPIClient, XiaohongshuClient
from app.crud import travel_crud
import json
import time
from datetime import datetime
from decimal import Decimal


class TravelService:
    """旅行规划服务"""
    
    def __init__(self):
        # 初始化DeepSeek LLM（使用OpenAI兼容接口）
        self.llm = ChatOpenAI(
            model="deepseek-chat",
            api_key=settings.DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com/v1",
            temperature=0.7,
            max_tokens=2000
        )
        self.location_client = LocationAPIClient()
        self.xiaohongshu_client = XiaohongshuClient()
    
    def generate_itinerary(
        self,
        travel_plan_id: int,
        start_date: date,
        end_date: date,
        destination: str,
        interests: List[str],
        food_preferences: List[str],
        travelers: str,
        budget_min: float,
        budget_max: float,
        xiaohongshu_notes: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """生成旅行路线规划"""
        
        # 计算旅行天数
        days = (end_date - start_date).days + 1
        
        # 获取小红书笔记内容
        xhs_content = ""
        if xiaohongshu_notes:
            for note_url in xiaohongshu_notes:
                note_content = self.xiaohongshu_client.get_note_content(note_url)
                if note_content:
                    xhs_content += f"\n笔记：{note_content.get('title', '')}\n{note_content.get('content', '')}\n"
        
        # 构建提示词
        prompt = self._build_itinerary_prompt(
            destination=destination,
            days=days,
            start_date=start_date.strftime("%Y-%m-%d"),
            interests=interests,
            food_preferences=food_preferences,
            travelers=travelers,
            budget_min=budget_min,
            budget_max=budget_max,
            xhs_content=xhs_content
        )
        
        # 调用LLM生成路线
        try:
            messages = [HumanMessage(content=prompt)]
            response = self.llm.invoke(messages)
            itinerary_text = response.content
            
            # 解析LLM返回的路线（JSON格式）
            itinerary_data = self._parse_itinerary_response(itinerary_text, days)
            
            # 获取推荐的景点和餐厅
            attractions = self.location_client.search_attractions(destination)
            restaurants = self.location_client.search_restaurants(destination)
            
            # 保存路线详情到数据库
            itinerary_details = []
            for day_num in range(1, days + 1):
                day_itinerary = itinerary_data.get(f"day_{day_num}", {})
                day_spots = day_itinerary.get("spots", [])
                day_restaurants = day_itinerary.get("restaurants", [])
                
                # 创建路线详情
                detail_id = travel_crud.create_itinerary_detail(
                    travel_plan_id=travel_plan_id,
                    day_number=day_num,
                    itinerary=day_itinerary,
                    recommended_spots=day_spots[:5],  # 限制数量
                    recommended_restaurants=day_restaurants[:3]
                )
                
                if detail_id:
                    itinerary_details.append({
                        "day_number": day_num,
                        "itinerary": day_itinerary,
                        "spots": day_spots[:5],
                        "restaurants": day_restaurants[:3]
                    })
            
            return {
                "success": True,
                "travel_plan_id": travel_plan_id,
                "days": days,
                "itinerary_details": itinerary_details,
                "attractions": attractions[:20],  # 限制数量
                "restaurants": restaurants[:20]
            }
            
        except Exception as e:
            print(f"❌ 生成路线失败：{e}")
            return {
                "success": False,
                "error": str(e)
            }

    def generate_itinerary_stream(
        self,
        travel_plan_id: int,
        start_date: date,
        end_date: date,
        destination: str,
        interests: List[str],
        food_preferences: List[str],
        travelers: str,
        budget_min: float,
        budget_max: float,
        xiaohongshu_notes: Optional[List[str]] = None,
    ):
        """
        流式生成路线：以 SSE 事件的形式逐步输出（token/progress/result/error）。
        注意：前端使用 fetch + ReadableStream 读取。
        """

        def _json_safe(obj: Any):
            """递归把 datetime/date/Decimal 等不可序列化对象转为可 JSON 的类型。"""
            if obj is None:
                return None
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            if isinstance(obj, Decimal):
                return float(obj)
            if isinstance(obj, dict):
                return {k: _json_safe(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [_json_safe(v) for v in obj]
            return obj

        def sse(event: str, data_obj: Any) -> str:
            safe = _json_safe(data_obj)
            return f"event: {event}\ndata: {json.dumps(safe, ensure_ascii=False)}\n\n"

        # 先发一个 comment（兼容某些代理/浏览器更快 flush）
        yield ":\n\n"
        # 再发 started
        yield sse("started", {"travel_plan_id": travel_plan_id, "destination": destination})
        # 心跳，避免某些环境长时间无数据导致前端看起来“卡死”（以及代理超时）
        yield sse("heartbeat", {"ts": time.time()})

        days = (end_date - start_date).days + 1

        # 小红书内容（可选）
        xhs_content = ""
        if xiaohongshu_notes:
            for note_url in xiaohongshu_notes:
                note_content = self.xiaohongshu_client.get_note_content(note_url)
                if note_content:
                    xhs_content += f"\n笔记：{note_content.get('title', '')}\n{note_content.get('content', '')}\n"

        prompt = self._build_itinerary_prompt(
            destination=destination,
            days=days,
            start_date=start_date.strftime("%Y-%m-%d"),
            interests=interests,
            food_preferences=food_preferences,
            travelers=travelers,
            budget_min=budget_min,
            budget_max=budget_max,
            xhs_content=xhs_content,
        )

        # LLM token 流（如果当前 langchain 版本不支持 stream，会退化为一次性生成）
        text_buf = ""
        try:
            messages = [HumanMessage(content=prompt)]

            if hasattr(self.llm, "stream"):
                yield sse("progress", {"stage": "llm_stream_start"})
                for chunk in self.llm.stream(messages):
                    token = getattr(chunk, "content", None)
                    if not token:
                        continue
                    text_buf += token
                    yield sse("token", {"delta": token})
                yield sse("progress", {"stage": "llm_stream_end"})
            else:
                yield sse("progress", {"stage": "llm_invoke"})
                resp = self.llm.invoke(messages)
                text_buf = resp.content or ""
                yield sse("token", {"delta": text_buf})

            yield sse("progress", {"stage": "parse_json"})
            itinerary_data = self._parse_itinerary_response(text_buf, days)

            yield sse("progress", {"stage": "fetch_recommendations"})
            attractions = self.location_client.search_attractions(destination)
            restaurants = self.location_client.search_restaurants(destination)

            # 如果没有经纬度，尝试用地理编码补齐（高德/Google 取决于国内外判断与 key）
            def _ensure_lat_lng(items: List[Dict[str, Any]], name_key: str = "name") -> List[Dict[str, Any]]:
                enriched = []
                for item in items:
                    lat = item.get("latitude")
                    lng = item.get("longitude")
                    if (lat is None or lng is None) and item.get(name_key):
                        geo = self.location_client.geocode(f"{destination} {item.get(name_key)}", location=destination)
                        if geo and geo.get("latitude") is not None and geo.get("longitude") is not None:
                            item["latitude"] = geo["latitude"]
                            item["longitude"] = geo["longitude"]
                    enriched.append(item)
                return enriched

            attractions = _ensure_lat_lng(attractions, "name")
            restaurants = _ensure_lat_lng(restaurants, "name")

            # 额外获取航班与住宿（如果有经纬度则可用于地图）
            flights = travel_crud.get_flights_by_plan(travel_plan_id)
            accommodations = travel_crud.get_accommodations_by_plan(travel_plan_id)

            yield sse("progress", {"stage": "persist"})
            itinerary_details = []
            for day_num in range(1, days + 1):
                day_itinerary = itinerary_data.get(f"day_{day_num}", {})
                day_spots = day_itinerary.get("spots", [])
                day_restaurants = day_itinerary.get("restaurants", [])

                travel_crud.create_itinerary_detail(
                    travel_plan_id=travel_plan_id,
                    day_number=day_num,
                    itinerary=day_itinerary,
                    recommended_spots=day_spots[:5],
                    recommended_restaurants=day_restaurants[:3],
                )

                itinerary_details.append(
                    {
                        "day_number": day_num,
                        "itinerary": day_itinerary,
                        "spots": day_spots[:5],
                        "restaurants": day_restaurants[:3],
                    }
                )

                # 逐天推送进度，前端可实时渲染
                yield sse("day", {"day_number": day_num, "itinerary": day_itinerary})

            result = {
                "success": True,
                "travel_plan_id": travel_plan_id,
                "days": days,
                "itinerary_details": itinerary_details,
                "attractions": attractions[:20],
                "restaurants": restaurants[:20],
                "flights": flights,
                "accommodations": accommodations,
            }
            yield sse("result", result)

        except Exception as e:
            yield sse("error", {"message": str(e)})
    
    def _build_itinerary_prompt(
        self,
        destination: str,
        days: int,
        start_date: str,
        interests: List[str],
        food_preferences: List[str],
        travelers: str,
        budget_min: float,
        budget_max: float,
        xhs_content: str = ""
    ) -> str:
        """构建路线生成提示词"""
        
        interests_str = "、".join(interests) if interests else "无特殊偏好"
        food_str = "、".join(food_preferences) if food_preferences else "无特殊偏好"
        
        prompt = f"""你是一位专业的旅行规划师。请为以下旅行需求生成详细的{days}天旅行路线规划。

目的地：{destination}
出发日期：{start_date}
旅行天数：{days}天
出行人员：{travelers}
旅行偏好：{interests_str}
饮食偏好：{food_str}
预算范围：{budget_min} - {budget_max} 元

{f"参考的小红书笔记内容：{xhs_content}" if xhs_content else ""}

请按照以下JSON格式返回路线规划：
{{
    "day_1": {{
        "date": "{start_date}",
        "theme": "主题描述",
        "morning": {{
            "time": "09:00-12:00",
            "activity": "活动描述",
            "location": "地点名称",
            "description": "详细描述"
        }},
        "afternoon": {{
            "time": "14:00-18:00",
            "activity": "活动描述",
            "location": "地点名称",
            "description": "详细描述"
        }},
        "evening": {{
            "time": "19:00-21:00",
            "activity": "活动描述",
            "location": "地点名称",
            "description": "详细描述"
        }},
        "spots": [
            {{"name": "景点名称", "description": "景点描述", "recommended_time": "建议游览时间"}}
        ],
        "restaurants": [
            {{"name": "餐厅名称", "cuisine": "菜系", "description": "餐厅描述", "price_range": "价格范围"}}
        ],
        "tips": "当日旅行小贴士"
    }},
    "day_2": {{...}},
    ...
}}

要求：
1. 每天安排3-5个主要活动
2. 考虑交通便利性和时间合理性
3. 结合用户的旅行偏好和饮食偏好
4. 控制预算在指定范围内
5. 提供实用的旅行建议和注意事项
6. 确保路线连贯，避免重复路线

请直接返回JSON格式，不要包含其他文字说明。"""

        return prompt
    
    def _parse_itinerary_response(self, response_text: str, days: int) -> Dict[str, Any]:
        """解析LLM返回的路线文本"""
        import json
        import re
        
        try:
            # 尝试提取JSON部分
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
        except Exception as e:
            print(f"❌ 解析路线JSON失败：{e}")
        
        # 如果解析失败，返回默认结构
        default_itinerary = {}
        for day in range(1, days + 1):
            default_itinerary[f"day_{day}"] = {
                "theme": f"第{day}天行程",
                "morning": {"time": "09:00-12:00", "activity": "待规划", "location": "", "description": ""},
                "afternoon": {"time": "14:00-18:00", "activity": "待规划", "location": "", "description": ""},
                "evening": {"time": "19:00-21:00", "activity": "待规划", "location": "", "description": ""},
                "spots": [],
                "restaurants": [],
                "tips": ""
            }
        
        return default_itinerary
    
    def get_recommendations(
        self,
        destination: str,
        interests: List[str],
        food_preferences: List[str]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """获取推荐景点和餐厅"""
        attractions = self.location_client.search_attractions(destination)
        restaurants = self.location_client.search_restaurants(destination)
        
        # 根据偏好过滤
        filtered_attractions = self._filter_by_interests(attractions, interests)
        filtered_restaurants = self._filter_by_food_preferences(restaurants, food_preferences)
        
        return {
            "attractions": filtered_attractions[:20],
            "restaurants": filtered_restaurants[:20]
        }
    
    def _filter_by_interests(
        self,
        attractions: List[Dict[str, Any]],
        interests: List[str]
    ) -> List[Dict[str, Any]]:
        """根据兴趣偏好过滤景点"""
        if not interests:
            return attractions
        
        # 简单的关键词匹配（实际应该更智能）
        filtered = []
        for attr in attractions:
            name = attr.get("name", "").lower()
            desc = attr.get("description", "").lower()
            
            for interest in interests:
                if interest.lower() in name or interest.lower() in desc:
                    filtered.append(attr)
                    break
        
        return filtered if filtered else attractions
    
    def _filter_by_food_preferences(
        self,
        restaurants: List[Dict[str, Any]],
        food_preferences: List[str]
    ) -> List[Dict[str, Any]]:
        """根据饮食偏好过滤餐厅"""
        if not food_preferences:
            return restaurants
        
        filtered = []
        for rest in restaurants:
            name = rest.get("name", "").lower()
            cuisine = rest.get("cuisine_type", "").lower()
            
            for pref in food_preferences:
                if pref.lower() in name or pref.lower() in cuisine:
                    filtered.append(rest)
                    break
        
        return filtered if filtered else restaurants
