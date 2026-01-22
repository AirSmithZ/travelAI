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
            # 行程 JSON 很长，2000 容易被截断导致解析失败；提高上限以确保输出完整
            max_tokens=6000
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
            """递归把 datetime/date/Decimal/Pydantic模型 等不可序列化对象转为可 JSON 的类型。"""
            if obj is None:
                return None
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            if isinstance(obj, Decimal):
                return float(obj)
            # 处理Pydantic模型实例
            if hasattr(obj, 'model_dump'):
                # Pydantic v2
                return _json_safe(obj.model_dump())
            if hasattr(obj, 'dict'):
                # Pydantic v1
                return _json_safe(obj.dict())
            # 处理Pydantic模型类（ModelMetaclass）- 不应该序列化类本身
            if type(obj).__name__ == 'ModelMetaclass' or (hasattr(obj, '__module__') and 'pydantic' in str(type(obj))):
                return None  # 或者返回一个标识字符串
            # 处理类型/类对象
            if isinstance(type(obj), type) and obj.__class__.__name__ in ['ModelMetaclass', 'type']:
                return None
            if isinstance(obj, dict):
                return {k: _json_safe(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [_json_safe(v) for v in obj]
            # 对于其他不可序列化的类型，尝试转换为字符串
            try:
                json.dumps(obj)
                return obj
            except (TypeError, ValueError):
                # 如果无法序列化，返回字符串表示或None
                return str(obj) if obj is not None else None

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

        # 小红书内容（可选）- 优先使用CDATA作为关键数据
        xhs_content = ""
        xhs_cdata_list = []
        if xiaohongshu_notes:
            for note_url in xiaohongshu_notes:
                # 优先获取CDATA（更详细的结构化数据）
                cdata = self.xiaohongshu_client.get_note_cdata(note_url)
                if cdata and isinstance(cdata, dict):
                    xhs_cdata_list.append(cdata)
                    # 构建详细的CDATA内容描述
                    title = cdata.get('title', '')
                    content = cdata.get('content', '')
                    raw_content = cdata.get('raw_content', '')
                    cdata_info = cdata.get('cdata', {})
                    
                    # 提取关键信息
                    recommendations = cdata_info.get('recommendations', {}) if isinstance(cdata_info, dict) else {}
                    tips = cdata_info.get('tips', []) if isinstance(cdata_info, dict) else []
                    tags = cdata_info.get('tags', []) if isinstance(cdata_info, dict) else []
                    
                    # 构建详细的笔记内容描述
                    note_desc = f"\n【小红书笔记 - 关键数据】\n"
                    note_desc += f"标题：{title}\n"
                    if content:
                        note_desc += f"内容摘要：{content}\n"
                    if raw_content:
                        note_desc += f"详细内容：{raw_content}\n"
                    if recommendations:
                        if recommendations.get('attractions'):
                            note_desc += f"推荐景点：{', '.join(recommendations['attractions'])}\n"
                        if recommendations.get('restaurants'):
                            note_desc += f"推荐餐厅：{', '.join(recommendations['restaurants'])}\n"
                        if recommendations.get('accommodations'):
                            note_desc += f"推荐住宿：{', '.join(recommendations['accommodations'])}\n"
                    if tips:
                        note_desc += f"旅行Tips：{'; '.join(tips)}\n"
                    if tags:
                        note_desc += f"标签：{', '.join(tags)}\n"
                    
                    xhs_content += note_desc
                else:
                    # 如果CDATA获取失败，回退到普通内容获取
                    note_content = self.xiaohongshu_client.get_note_content(note_url)
                    if note_content and isinstance(note_content, dict):
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
            xhs_cdata_list=xhs_cdata_list,  # 传递CDATA列表作为关键数据
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
            print(f"📝 开始解析 LLM 返回的 JSON，文本长度：{len(text_buf)}")
            itinerary_data = self._parse_itinerary_response(text_buf, days)
            
            # 确保 itinerary_data 是字典类型
            if not isinstance(itinerary_data, dict):
                print(f"⚠️ 警告：解析结果不是字典类型：{type(itinerary_data)}")
                itinerary_data = {}
            
            print(f"📊 解析结果：共 {len(itinerary_data)} 天的数据")
            for day_key, day_data in itinerary_data.items():
                # 确保 day_data 是字典类型
                if not isinstance(day_data, dict):
                    print(f"⚠️ 警告：{day_key} 的数据不是字典类型：{type(day_data)}")
                    continue
                schedule = day_data.get("schedule", {})
                # 确保 schedule 是字典类型
                if not isinstance(schedule, dict):
                    schedule = {}
                print(f"  {day_key}: schedule.morning={len(schedule.get('morning', []))}, afternoon={len(schedule.get('afternoon', []))}, evening={len(schedule.get('evening', []))}")

            yield sse("progress", {"stage": "fetch_recommendations"})
            print(f"🔍 开始搜索景点和餐厅：destination={destination}")
            attractions = self.location_client.search_attractions(destination)
            restaurants = self.location_client.search_restaurants(destination)
            print(f"📊 搜索结果：attractions={len(attractions) if attractions else 0}, restaurants={len(restaurants) if restaurants else 0}")

            # 如果没有经纬度，尝试用地理编码补齐（高德/Google 取决于国内外判断与 key）
            def _ensure_lat_lng(items: List[Dict[str, Any]], name_key: str = "name") -> List[Dict[str, Any]]:
                enriched = []
                for item in items:
                    # 确保 item 是字典类型
                    if not isinstance(item, dict):
                        enriched.append(item)
                        continue
                    
                    lat = item.get("latitude")
                    lng = item.get("longitude")
                    if (lat is None or lng is None) and item.get(name_key):
                        geo = self.location_client.geocode(f"{destination} {item.get(name_key)}", location=destination)
                        # 确保 geo 是字典类型
                        if geo and isinstance(geo, dict) and geo.get("latitude") is not None and geo.get("longitude") is not None:
                            item["latitude"] = geo["latitude"]
                            item["longitude"] = geo["longitude"]
                    enriched.append(item)
                return enriched

            attractions = _ensure_lat_lng(attractions, "name")
            restaurants = _ensure_lat_lng(restaurants, "name")

            # 额外获取航班与住宿（如果有经纬度则可用于地图）
            flights = travel_crud.get_flights_by_plan(travel_plan_id)
            accommodations = travel_crud.get_accommodations_by_plan(travel_plan_id)
            
            # 确保 accommodations 是字典列表，过滤掉非字典类型的数据
            if accommodations:
                accommodations = [acc for acc in accommodations if isinstance(acc, dict)]
            
            # 为住宿和航班添加经纬度（如果缺失）
            def _geocode_accommodation(acc):
                """为住宿地址添加经纬度 - 优先使用数据库中的经纬度"""
                if not isinstance(acc, dict):
                    return acc
                # 优先使用数据库中已有的经纬度（确保是数字类型）
                lat = acc.get("latitude")
                lng = acc.get("longitude")
                if lat is not None and lng is not None:
                    try:
                        lat_float = float(lat)
                        lng_float = float(lng)
                        if lat_float != 0.0 or lng_float != 0.0:  # 排除 (0,0) 这种无效坐标
                            acc["latitude"] = lat_float
                            acc["longitude"] = lng_float
                            print(f"✅ 使用数据库中的住宿坐标：{acc.get('address', '')} -> ({lat_float}, {lng_float})")
                            return acc
                    except (ValueError, TypeError):
                        pass
                # 如果数据库中没有有效经纬度，才进行地理编码
                city = acc.get("city", "")
                address = acc.get("address", "")
                if city and address:
                    print(f"🔍 为住宿进行地理编码：{city} {address}")
                    geo = self.location_client.geocode(f"{city} {address}", location=city)
                    # 确保 geo 是字典类型
                    if geo and isinstance(geo, dict):
                        geo_lat = geo.get("latitude")
                        geo_lng = geo.get("longitude")
                        if geo_lat is not None and geo_lng is not None:
                            acc["latitude"] = float(geo_lat)
                            acc["longitude"] = float(geo_lng)
                            print(f"✅ 地理编码结果：{address} -> ({geo_lat}, {geo_lng})")
                return acc
            
            accommodations = [_geocode_accommodation(acc) for acc in accommodations if isinstance(acc, dict)]
            
            # 确保 flights 是字典列表，过滤掉非字典类型的数据
            if flights:
                flights = [f for f in flights if isinstance(f, dict)]
            
            # 为航班机场添加经纬度（如果缺失）
            # 注意：单程航班只有 departure_airport 和 arrival_airport，需要分别获取经纬度
            def _geocode_flight(flight):
                """为航班机场添加经纬度（分别处理出发机场和到达机场）"""
                if not isinstance(flight, dict):
                    return flight
                
                # 处理出发机场
                dep_airport = flight.get("departure_airport", "")
                if dep_airport:
                    # 检查是否已有出发机场的经纬度（可能存储在 departure_latitude/departure_longitude）
                    if not (flight.get("departure_latitude") and flight.get("departure_longitude")):
                        geo = self.location_client.geocode(f"{destination} {dep_airport}", location=destination)
                        if geo and isinstance(geo, dict) and geo.get("latitude") and geo.get("longitude"):
                            flight["departure_latitude"] = geo.get("latitude")
                            flight["departure_longitude"] = geo.get("longitude")
                            print(f"✅ 出发机场地理编码：{dep_airport} -> ({geo.get('latitude')}, {geo.get('longitude')})")
                
                # 处理到达机场
                arr_airport = flight.get("arrival_airport", "")
                if arr_airport and arr_airport != dep_airport:  # 避免重复编码相同机场
                    if not (flight.get("arrival_latitude") and flight.get("arrival_longitude")):
                        geo = self.location_client.geocode(f"{destination} {arr_airport}", location=destination)
                        if geo and isinstance(geo, dict) and geo.get("latitude") and geo.get("longitude"):
                            flight["arrival_latitude"] = geo.get("latitude")
                            flight["arrival_longitude"] = geo.get("longitude")
                            print(f"✅ 到达机场地理编码：{arr_airport} -> ({geo.get('latitude')}, {geo.get('longitude')})")
                
                # 兼容旧字段（如果只有 latitude/longitude，可能是出发机场）
                if not flight.get("departure_latitude") and flight.get("latitude"):
                    flight["departure_latitude"] = flight["latitude"]
                    flight["departure_longitude"] = flight["longitude"]
                
                return flight
            
            flights = [_geocode_flight(f) for f in flights if isinstance(f, dict)]
            
            # 计算每天的起始点和终止点
            def _get_day_start_end_points(day_num: int, current_date: date) -> Dict[str, Optional[Dict[str, Any]]]:
                """
                根据日期获取当天的起始点和终止点
                规则：
                1. 如果当天是某个住宿的入住日期，该住宿作为起始点
                2. 如果当天是某个住宿的退房日期，该住宿作为终止点
                3. 如果当天在某个住宿的入住期间（入住日期 < 当天 < 退房日期），该住宿作为起始点和终止点
                4. 航班逻辑：
                   - 单程航班：出发机场作为第一天的起始点，到达机场作为最后一天的终止点
                   - 多程航班：根据每个航班的时间点确定每天的起始/终止点
                   - 如果当天有航班到达，到达机场作为起始点
                   - 如果当天有航班出发，出发机场作为终止点
                """
                start_point = None
                end_point = None
                
                # 辅助函数：将日期字符串或对象转换为 date
                def _to_date(d):
                    if d is None:
                        return None
                    if isinstance(d, str):
                        try:
                            # 处理 datetime 字符串（包含时间部分）
                            if 'T' in d or ' ' in d:
                                return datetime.strptime(d[:19], "%Y-%m-%dT%H:%M:%S" if 'T' in d else "%Y-%m-%d %H:%M:%S").date()
                            return datetime.strptime(d[:10], "%Y-%m-%d").date()
                        except:
                            return None
                    if hasattr(d, 'date'):
                        return d.date()
                    if isinstance(d, date):
                        return d
                    return None
                
                # 查找当天的住宿
                for acc in accommodations:
                    # 确保 acc 是字典类型
                    if not isinstance(acc, dict):
                        continue
                    
                    check_in = _to_date(acc.get("check_in_date"))
                    check_out = _to_date(acc.get("check_out_date"))
                    
                    if not check_in:
                        continue
                    
                    # 检查是否有经纬度
                    if not (acc.get("latitude") and acc.get("longitude")):
                        continue
                    
                    acc_point = {
                        "lat": float(acc["latitude"]),
                        "lng": float(acc["longitude"]),
                        "name": acc.get("address", ""),
                        "category": "住宿",
                        "type": "accommodation"
                    }
                    
                    # 情况1：当天是入住日期，作为起始点
                    if check_in == current_date:
                        start_point = acc_point.copy()
                        # 如果当天也是退房日期（同一天入住退房），也作为终止点
                        if check_out == current_date:
                            end_point = acc_point.copy()
                    
                    # 情况2：当天是退房日期，作为终止点
                    elif check_out and check_out == current_date:
                        end_point = acc_point.copy()
                        # 如果还没有起始点，也作为起始点（当天退房后可能还要活动）
                        if not start_point:
                            start_point = acc_point.copy()
                    
                    # 情况3：当天在住宿期间（入住日期 < 当天 < 退房日期）
                    elif check_out and check_in < current_date < check_out:
                        # 如果还没有起始点，设为住宿
                        if not start_point:
                            start_point = acc_point.copy()
                        # 终止点也设为住宿
                        end_point = acc_point.copy()
                
                # 处理航班逻辑（单程和多程）
                # 1. 检查当天是否有航班到达（到达机场作为起始点）
                for flight in flights:
                    if not isinstance(flight, dict):
                        continue
                    
                    # 检查到达时间（arrival_time 或 return_time）
                    arrival_time = _to_date(flight.get("arrival_time")) or _to_date(flight.get("return_time"))
                    if arrival_time and arrival_time == current_date:
                        # 使用到达机场的经纬度
                        lat = flight.get("arrival_latitude") or flight.get("latitude")
                        lng = flight.get("arrival_longitude") or flight.get("longitude")
                        if lat and lng:
                            airport_name = flight.get("arrival_airport", "")
                            if airport_name and not start_point:  # 如果还没有起始点，使用到达机场
                                start_point = {
                                    "lat": float(lat),
                                    "lng": float(lng),
                                    "name": airport_name,
                                    "category": "机场",
                                    "type": "airport"
                                }
                                print(f"✅ 第{day_num}天：使用到达机场作为起始点 - {airport_name}")
                    
                    # 检查出发时间（departure_time）
                    dep_time = _to_date(flight.get("departure_time"))
                    if dep_time and dep_time == current_date:
                        # 使用出发机场的经纬度
                        lat = flight.get("departure_latitude") or flight.get("latitude")
                        lng = flight.get("departure_longitude") or flight.get("longitude")
                        if lat and lng:
                            airport_name = flight.get("departure_airport", "")
                            if airport_name:
                                # 出发机场作为终止点（当天出发）
                                end_point = {
                                    "lat": float(lat),
                                    "lng": float(lng),
                                    "name": airport_name,
                                    "category": "机场",
                                    "type": "airport"
                                }
                                print(f"✅ 第{day_num}天：使用出发机场作为终止点 - {airport_name}")
                
                # 2. 单程航班特殊处理：如果没有找到起始点且是第一天，使用第一个航班的出发机场
                if not start_point and day_num == 1:
                    for flight in flights:
                        if not isinstance(flight, dict):
                            continue
                        dep_time = _to_date(flight.get("departure_time"))
                        if dep_time:
                            lat = flight.get("departure_latitude") or flight.get("latitude")
                            lng = flight.get("departure_longitude") or flight.get("longitude")
                            if lat and lng:
                                start_point = {
                                    "lat": float(lat),
                                    "lng": float(lng),
                                    "name": flight.get("departure_airport", ""),
                                    "category": "机场",
                                    "type": "airport"
                                }
                                print(f"✅ 第1天：使用出发机场作为起始点（单程航班） - {flight.get('departure_airport', '')}")
                                break
                
                # 3. 单程航班特殊处理：如果没有找到终止点且是最后一天，使用最后一个航班的到达机场
                if not end_point and day_num == days:
                    # 找到最后一个有到达时间的航班
                    last_arrival_flight = None
                    for flight in flights:
                        if not isinstance(flight, dict):
                            continue
                        arrival_time = _to_date(flight.get("arrival_time")) or _to_date(flight.get("return_time"))
                        if arrival_time:
                            if last_arrival_flight is None or arrival_time > _to_date(last_arrival_flight.get("arrival_time") or last_arrival_flight.get("return_time")):
                                last_arrival_flight = flight
                    
                    if last_arrival_flight:
                        lat = last_arrival_flight.get("arrival_latitude") or last_arrival_flight.get("latitude")
                        lng = last_arrival_flight.get("arrival_longitude") or last_arrival_flight.get("longitude")
                        if lat and lng:
                            end_point = {
                                "lat": float(lat),
                                "lng": float(lng),
                                "name": last_arrival_flight.get("arrival_airport", ""),
                                "category": "机场",
                                "type": "airport"
                            }
                            print(f"✅ 第{days}天：使用到达机场作为终止点（单程航班） - {last_arrival_flight.get('arrival_airport', '')}")
                
                return {"start": start_point, "end": end_point}

            yield sse("progress", {"stage": "persist"})
            itinerary_details = []
            
            # 计算每天的日期
            from datetime import timedelta
            for day_num in range(1, days + 1):
                current_date = start_date + timedelta(days=day_num - 1)
                day_itinerary_raw = itinerary_data.get(f"day_{day_num}", {})
                
                # 确保 day_itinerary 是字典类型
                if not isinstance(day_itinerary_raw, dict):
                    print(f"⚠️ 警告：day_{day_num} 的数据不是字典类型：{type(day_itinerary_raw)}，使用默认值")
                    day_itinerary = {
                        "schedule": {"morning": [], "afternoon": [], "evening": []},
                        "spots": [],
                        "restaurants": []
                    }
                else:
                    day_itinerary = day_itinerary_raw
                
                # 获取当天的起始点和终止点
                day_points = _get_day_start_end_points(day_num, current_date)
                
                # 兼容新结构 schedule：派生 spots/restaurants，避免下游结果为空
                day_spots = day_itinerary.get("spots", []) or []
                day_restaurants = day_itinerary.get("restaurants", []) or []
                schedule_raw = day_itinerary.get("schedule")
                # 确保 schedule 是字典类型
                if not isinstance(schedule_raw, dict):
                    schedule = {}
                else:
                    schedule = schedule_raw
                if (not day_spots and not day_restaurants) and schedule:
                    def _norm_list(v):
                        if not v:
                            return []
                        if isinstance(v, list):
                            return v
                        if isinstance(v, dict) and isinstance(v.get("items"), list):
                            return v.get("items")
                        if isinstance(v, dict):
                            return [v]
                        return []
                    merged = []
                    merged += _norm_list(schedule.get("morning") if isinstance(schedule, dict) else [])
                    merged += _norm_list(schedule.get("afternoon") if isinstance(schedule, dict) else [])
                    merged += _norm_list(schedule.get("evening") if isinstance(schedule, dict) else [])
                    # 简单按 type/cuisine 判断
                    for p in merged:
                        # 确保 p 是字典类型
                        if not isinstance(p, dict):
                            continue
                        ptype = p.get("type") or ("restaurant" if (p.get("cuisine") or p.get("cuisine_type") or p.get("price_range")) else "spot")
                        if ptype == "restaurant":
                            day_restaurants.append(p)
                        else:
                            day_spots.append(p)
                    # 回写到 itinerary，便于前端/DB 兼容读取
                    day_itinerary["spots"] = day_spots
                    day_itinerary["restaurants"] = day_restaurants

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

                # 由后端直接组装前端可用的 items，减轻前端解析逻辑
                def _num(v):
                    if v is None:
                        return None
                    if isinstance(v, (int, float)):
                        return float(v)
                    try:
                        return float(v)
                    except Exception:
                        return None

                def _dur(v, default=60):
                    if v is None:
                        return default
                    if isinstance(v, (int, float)):
                        return int(v)
                    try:
                        return int(float(v))
                    except Exception:
                        return default

                def _norm_notes(v) -> List[str]:
                    if not v:
                        return []
                    if isinstance(v, list):
                        return [str(x) for x in v if x is not None and str(x).strip()]
                    if isinstance(v, str):
                        vv = v.strip()
                        return [vv] if vv else []
                    return [str(v)]

                def _cost_for(item: Dict[str, Any], category: str) -> Dict[str, Any]:
                    """
                    费用估算（尽量轻量 & 可读）：
                    - 美食：优先用 price_range（可能是“人均 80-120”/“¥120”/“80-120”）
                    - 景点：若有 ticket_price/ticket/price 字段则用，否则给一个 0~80 的保守区间
                    - 机场/住宿：默认 0（此处更多用于地图点）
                    返回：{ cost: str, cost_yuan: Optional[float] }
                    """
                    def _to_float(s: Any) -> Optional[float]:
                        if s is None:
                            return None
                        if isinstance(s, (int, float)):
                            try:
                                return float(s)
                            except Exception:
                                return None
                        try:
                            import re
                            m = re.findall(r"\d+(?:\.\d+)?", str(s))
                            if not m:
                                return None
                            # 取第一个数作为代表值
                            return float(m[0])
                        except Exception:
                            return None

                    if category == "美食":
                        pr = item.get("price_range") or item.get("price") or item.get("avg_price")
                        if pr:
                            label = str(pr).strip()
                            # 如果模型已经带了 “¥/人均”等前缀，就直接用；否则补充“人均 ¥xx”
                            if "¥" in label or "人均" in label:
                                text = label
                            else:
                                text = f"人均 ¥{label}"
                            return {"cost": text, "cost_yuan": _to_float(pr)}
                        return {"cost": "¥60-120 /人", "cost_yuan": 90.0}

                    if category == "景点":
                        tp = item.get("ticket_price") or item.get("ticket") or item.get("price")
                        if tp:
                            label = str(tp).strip()
                            text = label if "¥" in label else f"约 ¥{label}"
                            return {"cost": text, "cost_yuan": _to_float(tp)}
                        return {"cost": "¥0-80", "cost_yuan": 40.0}

                    return {"cost": "¥0", "cost_yuan": 0.0}

                # 逐天推送给前端：按早/中/晚分组，确保拖拽只影响分组内部排序
                schedule_raw = day_itinerary.get("schedule")
                # 确保 schedule 是字典类型
                if not isinstance(schedule_raw, dict):
                    schedule = {}
                else:
                    schedule = schedule_raw
                segments = ["morning", "afternoon", "evening"]

                def _as_list(v) -> List[Dict[str, Any]]:
                    if not v:
                        return []
                    if isinstance(v, list):
                        return [x for x in v if isinstance(x, dict)]
                    if isinstance(v, dict) and isinstance(v.get("items"), list):
                        return [x for x in v.get("items") if isinstance(x, dict)]
                    if isinstance(v, dict):
                        return [v]
                    return []

                grouped_items: Dict[str, List[Dict[str, Any]]] = {k: [] for k in segments}
                # 优先使用 schedule（模型按早/中/晚输出）
                # 确保 schedule 是字典后再使用 .get()
                has_schedule = isinstance(schedule, dict) and any(_as_list(schedule.get(k)) for k in segments)
                print(f"📅 第{day_num}天：has_schedule={has_schedule}, schedule keys={list(schedule.keys()) if isinstance(schedule, dict) else []}")
                if has_schedule and isinstance(schedule, dict):
                    for seg in segments:
                        raw_items = _as_list(schedule.get(seg))
                        for idx, act in enumerate(raw_items):
                            ptype = act.get("type") or ("restaurant" if (act.get("cuisine") or act.get("cuisine_type") or act.get("price_range")) else "spot")
                            category = "美食" if ptype == "restaurant" else "景点"
                            
                    # 确保经纬度存在：优先使用 act 中的，否则从推荐列表中匹配
                    # 注意：如果是住宿或机场类型，应该已经在 start_point/end_point 中处理，这里主要是景点和餐厅
                    lat = _num(act.get("latitude"))
                    lng = _num(act.get("longitude"))
                    act_name = act.get("name") or act.get("location") or ""
                    
                    # 如果缺少经纬度，尝试从推荐列表中匹配
                    if (lat is None or lng is None) and act_name:
                        # 在 attractions 或 restaurants 中查找匹配项
                        search_list = attractions if category == "景点" else restaurants
                        for rec_item in search_list:
                            rec_name = rec_item.get("name", "")
                            if rec_name and (act_name.lower() in rec_name.lower() or rec_name.lower() in act_name.lower()):
                                if rec_item.get("latitude") is not None and rec_item.get("longitude") is not None:
                                    lat = _num(rec_item.get("latitude"))
                                    lng = _num(rec_item.get("longitude"))
                                    break
                        
                        # 如果仍然没有，尝试地理编码（但不要对住宿和机场进行地理编码，它们应该已经在 start_point/end_point 中）
                        if (lat is None or lng is None) and act_name and category not in ["住宿", "机场"]:
                            geo = self.location_client.geocode(f"{destination} {act_name}", location=destination)
                            if geo and isinstance(geo, dict) and geo.get("latitude") is not None and geo.get("longitude") is not None:
                                lat = _num(geo.get("latitude"))
                                lng = _num(geo.get("longitude"))
                            
                            base = {
                                "uniqueId": f"{'rest' if category == '美食' else 'spot'}_{day_num}_{seg}_{idx}",
                                "timeOfDay": seg,
                                "name": act_name or (f"餐厅{idx + 1}" if category == "美食" else f"景点{idx + 1}"),
                                "category": category,
                                "duration": _dur(act.get("play_time_minutes"), _dur(act.get("recommended_time"), 60)),
                                "lat": lat,
                                "lng": lng,
                                "description": act.get("description"),
                                "notes": _norm_notes(act.get("notes")),
                                "commute_from_prev": act.get("commute_from_prev"),
                            }
                            if category == "美食":
                                base["cuisine"] = act.get("cuisine")
                                base["price_range"] = act.get("price_range")
                            base.update(_cost_for(act, category))
                            grouped_items[seg].append(base)
                else:
                    # 无 schedule 的兼容：把 spots/restaurants 简单打散到 morning/afternoon/evening
                    merged = []
                    for s in (day_spots or []):
                        merged.append(("spot", s))
                    for r in (day_restaurants or []):
                        merged.append(("restaurant", r))
                    for idx, (ptype, act) in enumerate(merged):
                        seg = "morning" if idx % 3 == 0 else ("afternoon" if idx % 3 == 1 else "evening")
                        category = "美食" if ptype == "restaurant" else "景点"
                        
                        # 确保经纬度存在
                        lat = _num(act.get("latitude"))
                        lng = _num(act.get("longitude"))
                        act_name = act.get("name") or act.get("location") or ""
                        
                        # 如果缺少经纬度，尝试从推荐列表中匹配或地理编码
                        if (lat is None or lng is None) and act_name:
                            search_list = attractions if category == "景点" else restaurants
                            for rec_item in search_list:
                                rec_name = rec_item.get("name", "")
                                if rec_name and (act_name.lower() in rec_name.lower() or rec_name.lower() in act_name.lower()):
                                    if rec_item.get("latitude") is not None and rec_item.get("longitude") is not None:
                                        lat = _num(rec_item.get("latitude"))
                                        lng = _num(rec_item.get("longitude"))
                                        break
                            
                            if (lat is None or lng is None) and act_name:
                                geo = self.location_client.geocode(f"{destination} {act_name}", location=destination)
                                if geo and isinstance(geo, dict) and geo.get("latitude") is not None and geo.get("longitude") is not None:
                                    lat = _num(geo.get("latitude"))
                                    lng = _num(geo.get("longitude"))
                        
                        base = {
                            "uniqueId": f"{'rest' if category == '美食' else 'spot'}_{day_num}_{seg}_{idx}",
                            "timeOfDay": seg,
                            "name": act_name or (f"餐厅{idx + 1}" if category == "美食" else f"景点{idx + 1}"),
                            "category": category,
                            "duration": _dur(act.get("play_time_minutes"), _dur(act.get("recommended_time"), 60)),
                            "lat": lat,
                            "lng": lng,
                            "description": act.get("description"),
                            "notes": _norm_notes(act.get("notes")),
                            "commute_from_prev": act.get("commute_from_prev"),
                        }
                        if category == "美食":
                            base["cuisine"] = act.get("cuisine") or act.get("cuisine_type")
                            base["price_range"] = act.get("price_range")
                        base.update(_cost_for(act, category))
                        grouped_items[seg].append(base)

                # 如果 LLM 行程为空（既没有 schedule，又没有 spots/restaurants），
                # 则基于推荐的景点/餐厅按天兜底生成简单行程，避免前端收到完全空的 day。
                if not any(grouped_items[seg] for seg in segments):
                    per_day_spots = 2
                    per_day_restaurants = 1
                    spot_start = (day_num - 1) * per_day_spots
                    rest_start = (day_num - 1) * per_day_restaurants
                    spot_slice = attractions[spot_start: spot_start + per_day_spots]
                    rest_slice = restaurants[rest_start: rest_start + per_day_restaurants]

                    if spot_slice or rest_slice:
                        grouped_items = {k: [] for k in segments}

                        # 早上：主要景点 1
                        if len(spot_slice) >= 1:
                            s0 = spot_slice[0]
                            lat = _num(s0.get("latitude"))
                            lng = _num(s0.get("longitude"))
                            # 确保有经纬度
                            if (lat is None or lng is None) and s0.get("name"):
                                geo = self.location_client.geocode(f"{destination} {s0.get('name')}", location=destination)
                                if geo and isinstance(geo, dict):
                                    lat = _num(geo.get("latitude"))
                                    lng = _num(geo.get("longitude"))
                            base = {
                                "uniqueId": f"spot_{day_num}_morning_fallback_0",
                                "timeOfDay": "morning",
                                "name": s0.get("name") or s0.get("location") or "景点",
                                "category": "景点",
                                "duration": _dur(s0.get("play_time_minutes"), 120),
                                "lat": lat,
                                "lng": lng,
                                "description": s0.get("description"),
                                "notes": _norm_notes(s0.get("notes")),
                                "commute_from_prev": s0.get("commute_from_prev"),
                            }
                            base.update(_cost_for(s0, "景点"))
                            grouped_items["morning"].append(base)

                        # 下午：餐厅 1
                        if len(rest_slice) >= 1:
                            r0 = rest_slice[0]
                            lat = _num(r0.get("latitude"))
                            lng = _num(r0.get("longitude"))
                            if (lat is None or lng is None) and r0.get("name"):
                                geo = self.location_client.geocode(f"{destination} {r0.get('name')}", location=destination)
                                if geo and isinstance(geo, dict):
                                    lat = _num(geo.get("latitude"))
                                    lng = _num(geo.get("longitude"))
                            base = {
                                "uniqueId": f"rest_{day_num}_afternoon_fallback_0",
                                "timeOfDay": "afternoon",
                                "name": r0.get("name") or "推荐餐厅",
                                "category": "美食",
                                "duration": _dur(r0.get("play_time_minutes"), 60),
                                "lat": lat,
                                "lng": lng,
                                "description": r0.get("description"),
                                "notes": _norm_notes(r0.get("notes")),
                                "commute_from_prev": r0.get("commute_from_prev"),
                                "cuisine": r0.get("cuisine") or r0.get("cuisine_type"),
                                "price_range": r0.get("price_range"),
                            }
                            base.update(_cost_for(r0, "美食"))
                            grouped_items["afternoon"].append(base)

                        # 晚上：次要景点（如果有）
                        if len(spot_slice) >= 2:
                            s1 = spot_slice[1]
                            lat = _num(s1.get("latitude"))
                            lng = _num(s1.get("longitude"))
                            if (lat is None or lng is None) and s1.get("name"):
                                geo = self.location_client.geocode(f"{destination} {s1.get('name')}", location=destination)
                                if geo and isinstance(geo, dict):
                                    lat = _num(geo.get("latitude"))
                                    lng = _num(geo.get("longitude"))
                            base = {
                                "uniqueId": f"spot_{day_num}_evening_fallback_1",
                                "timeOfDay": "evening",
                                "name": s1.get("name") or "夜间景点",
                                "category": "景点",
                                "duration": _dur(s1.get("play_time_minutes"), 90),
                                "lat": lat,
                                "lng": lng,
                                "description": s1.get("description"),
                                "notes": _norm_notes(s1.get("notes")),
                                "commute_from_prev": s1.get("commute_from_prev"),
                            }
                            base.update(_cost_for(s1, "景点"))
                            grouped_items["evening"].append(base)

                # 逐天推送：直接给 items，并附带 stats 方便前端定位“为何为空”
                def _safe_len(v):
                    if isinstance(v, list):
                        return len(v)
                    if isinstance(v, dict) and isinstance(v.get("items"), list):
                        return len(v.get("items"))
                    return 0

                # 安全获取 schedule
                schedule_for_stats = day_itinerary.get("schedule")
                if not isinstance(schedule_for_stats, dict):
                    schedule_for_stats = {}
                
                stats = {
                    "spots": len(day_spots) if isinstance(day_spots, list) else 0,
                    "restaurants": len(day_restaurants) if isinstance(day_restaurants, list) else 0,
                    "schedule": {
                        "morning": _safe_len(schedule_for_stats.get("morning")),
                        "afternoon": _safe_len(schedule_for_stats.get("afternoon")),
                        "evening": _safe_len(schedule_for_stats.get("evening")),
                    },
                    "grouped_items": {
                        "morning": len(grouped_items.get("morning") or []),
                        "afternoon": len(grouped_items.get("afternoon") or []),
                        "evening": len(grouped_items.get("evening") or []),
                    }
                }

                # 打印每天的数据统计
                total_items = sum(len(grouped_items.get(seg, [])) for seg in segments)
                print(f"📤 推送第{day_num}天数据：total_items={total_items}, morning={len(grouped_items.get('morning', []))}, afternoon={len(grouped_items.get('afternoon', []))}, evening={len(grouped_items.get('evening', []))}")
                # 添加当天的起始点和终止点信息
                yield sse("day", {
                    "day_number": day_num, 
                    "items": grouped_items, 
                    "stats": stats,
                    "start_point": day_points["start"],
                    "end_point": day_points["end"]
                })

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
        xhs_content: str = "",
        xhs_cdata_list: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """构建路线生成提示词"""
        
        interests_str = "、".join(interests) if interests else "无特殊偏好"
        food_str = "、".join(food_preferences) if food_preferences else "无特殊偏好"
        
        # 构建小红书CDATA关键数据说明
        xhs_cdata_section = ""
        if xhs_cdata_list and len(xhs_cdata_list) > 0:
            xhs_cdata_section = "\n\n【⚠️ 重要：小红书笔记关键数据（CDATA）】\n"
            xhs_cdata_section += "以下是从小红书笔记中提取的结构化关键数据，这些数据应该作为生成路线的重要参考依据：\n"
            xhs_cdata_section += "- 优先考虑CDATA中推荐的景点、餐厅、住宿\n"
            xhs_cdata_section += "- 参考CDATA中的旅行Tips和注意事项\n"
            xhs_cdata_section += "- 结合CDATA中的标签和话题信息\n"
            xhs_cdata_section += "- CDATA数据比普通笔记内容更详细、更准确，应优先使用\n\n"
            for idx, cdata in enumerate(xhs_cdata_list, 1):
                xhs_cdata_section += f"笔记 {idx} CDATA数据：\n"
                xhs_cdata_section += json.dumps(cdata, ensure_ascii=False, indent=2) + "\n\n"
        
        prompt = f"""你是一位专业的旅行规划师。请为以下旅行需求生成详细的{days}天旅行路线规划。

目的地：{destination}
出发日期：{start_date}
旅行天数：{days}天
出行人员：{travelers}
旅行偏好：{interests_str}
饮食偏好：{food_str}
预算范围：{budget_min} - {budget_max} 元

{f"参考的小红书笔记内容：{xhs_content}" if xhs_content else ""}
{xhs_cdata_section}

请按照以下JSON格式返回路线规划（重点：按早/中/晚分段，并给出“点到点通勤”细节、游玩时长、注意事项）：
{{
    "day_1": {{
        "date": "{start_date}",
        "theme": "主题描述",
        "schedule": {{
            "morning": [
                {{
                    "type": "spot",
                    "name": "景点名称",
                    "description": "景点简介/看点",
                    "play_time_minutes": 90,
                    "recommended_time": "建议游览时间（例如 1-2小时）",
                    "notes": ["注意事项1", "注意事项2"],
                    "commute_from_prev": {{
                        "mode": "步行/地铁/公交/打车",
                        "duration_minutes": 15,
                        "transfers": 1,
                        "details": "是否换乘、建议线路/站点等提示"
                    }}
                }}
            ],
            "afternoon": [
                {{
                    "type": "restaurant",
                    "name": "餐厅名称",
                    "cuisine": "菜系",
                    "description": "餐厅特色与推荐菜",
                    "price_range": "人均/价格范围",
                    "play_time_minutes": 60,
                    "notes": ["注意事项（例如需排队/预约）"],
                    "commute_from_prev": {{
                        "mode": "地铁",
                        "duration_minutes": 25,
                        "transfers": 1,
                        "details": "换乘站点、出站口建议等"
                    }}
                }}
            ],
            "evening": []
        }},
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
5. 对每个活动给出合理的 play_time_minutes（分钟）
6. 对每个活动尽量给出 notes（注意事项），没有则给空数组 []
7. 对 morning/afternoon/evening 每个列表中，从第二个点开始给出 commute_from_prev（通勤方式/耗时/换乘次数/提示）
8. 确保路线连贯，避免重复路线
9. 不要输出除 JSON 外的任何文字

请直接返回JSON格式，不要包含其他文字说明。"""

        return prompt
    
    def _parse_itinerary_response(self, response_text: str, days: int) -> Dict[str, Any]:
        """解析LLM返回的路线文本"""
        import json
        import re

        def _strip_code_fences(text: str) -> str:
            """移除 ```json ... ``` / ``` ... ``` 等代码块包裹。"""
            if not text:
                return text
            # 去掉常见 ```json / ``` 包裹
            text = re.sub(r"^\s*```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```\s*$", "", text)
            return text.strip()

        raw = (response_text or "").strip()
        raw = _strip_code_fences(raw)

        # 1) 先尝试整段直接 json.loads（有些模型会严格返回 JSON）
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass

        # 2) 使用 JSONDecoder.raw_decode 从任意位置提取“第一段合法 JSON 对象”
        #    能容忍前后夹杂文本、以及 JSON 后还有多余字符
        decoder = json.JSONDecoder()
        start = raw.find("{")
        while start != -1:
            try:
                obj, end = decoder.raw_decode(raw[start:])
                if isinstance(obj, dict):
                    return obj
            except Exception:
                pass
            start = raw.find("{", start + 1)

        # 3) 兜底：尝试用最外层大括号截取（尽量修复模型在 JSON 前后夹杂的情况）
        try:
            first = raw.find("{")
            last = raw.rfind("}")
            if first != -1 and last != -1 and last > first:
                obj = json.loads(raw[first:last + 1])
                if isinstance(obj, dict):
                    return obj
        except Exception as e:
            print(f"❌ 解析路线JSON失败：{e}")
        
        # 如果解析失败，返回默认结构
        default_itinerary = {}
        for day in range(1, days + 1):
            default_itinerary[f"day_{day}"] = {
                "theme": f"第{day}天行程",
                "schedule": {
                    "morning": [],
                    "afternoon": [],
                    "evening": [],
                },
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
