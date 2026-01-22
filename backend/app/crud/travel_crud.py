import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.models.travel_models import get_db_connection
from app.schemas.travel_schemas import (
    TravelPlanCreate,
    ConversationCreate,
    TravelPlanResponse,
    ConversationResponse,
    ItineraryDetailResponse,
    AttractionResponse,
    RestaurantResponse,
    FlightResponse,
    AccommodationResponse,
)


# ==================== 用户相关 CRUD ====================

def create_or_get_user(username: str = "default_user", email: Optional[str] = None) -> int:
    """创建或获取用户ID"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        # 先查询用户是否存在
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
        if user:
            return user['id']
        
        # 创建新用户
        cursor.execute(
            "INSERT INTO users (username, email) VALUES (%s, %s)",
            (username, email)
        )
        connection.commit()
        return cursor.lastrowid
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建/获取用户失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


# ==================== 旅行规划 CRUD ====================

def create_travel_plan(user_id: int, plan_data: TravelPlanCreate) -> Optional[int]:
    """创建旅行规划"""
    connection = get_db_connection()
    if not connection:
        print("❌ 数据库连接失败：get_db_connection() 返回 None")
        return None
    
    cursor = None
    try:
        cursor = connection.cursor()
        print(f"📝 开始创建旅行规划，user_id={user_id}, destination={plan_data.destination}")
        
        # 验证用户是否存在
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            # 如果用户不存在，创建默认用户
            print(f"⚠️ 用户 {user_id} 不存在，尝试创建默认用户")
            cursor.execute("INSERT INTO users (id, username, email) VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE id=id", 
                         (user_id, f"user_{user_id}", f"user_{user_id}@example.com"))
            connection.commit()
            print(f"✅ 已创建默认用户 {user_id}")
        
        # 处理目的地（取第一个）
        destination = plan_data.destination[0] if plan_data.destination else ""
        
        # 插入旅行规划
        insert_sql = """
        INSERT INTO travel_plans (
            user_id, destination, budget_min, budget_max,
            interests, food_preferences, travelers,
            xiaohongshu_notes, addresses
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        # 准备插入值，确保类型正确
        try:
            addresses_json = json.dumps(
                [addr.model_dump() if hasattr(addr, 'model_dump') else addr.dict() for addr in plan_data.addresses], 
                ensure_ascii=False
            ) if plan_data.addresses else json.dumps([], ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ 序列化 addresses 失败：{e}")
            addresses_json = json.dumps([], ensure_ascii=False)
        
        values = (
            int(user_id),  # 确保是整数
            str(destination) if destination else "",  # 确保是字符串
            float(plan_data.budget.min),  # 确保是浮点数
            float(plan_data.budget.max),  # 确保是浮点数
            json.dumps(plan_data.interests or [], ensure_ascii=False),
            json.dumps(plan_data.food_preferences or [], ensure_ascii=False),
            str(plan_data.travelers) if plan_data.travelers else "",
            json.dumps(plan_data.xiaohongshu_notes or [], ensure_ascii=False),
            addresses_json
        )
        
        print(f"📋 准备插入的值：user_id={values[0]}, destination={values[1]}, budget={values[2]}-{values[3]}")
        
        # 执行插入
        affected_rows = cursor.execute(insert_sql, values)
        print(f"📊 INSERT 执行完成，affected_rows={affected_rows}")
        
        # 获取插入的 ID（多种方式尝试）
        plan_id = cursor.lastrowid
        print(f"📊 cursor.lastrowid={plan_id}")
        
        # 如果 lastrowid 无效，尝试使用 LAST_INSERT_ID()
        if not plan_id or plan_id == 0:
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            if result:
                plan_id = result.get('id') if isinstance(result, dict) else (result[0] if isinstance(result, (list, tuple)) else None)
                print(f"📊 使用 LAST_INSERT_ID() 获取 plan_id={plan_id}")
        
        # 如果仍然没有 plan_id，尝试通过查询获取
        if not plan_id or plan_id == 0:
            cursor.execute("""
                SELECT id FROM travel_plans 
                WHERE user_id = %s AND destination = %s 
                ORDER BY created_at DESC LIMIT 1
            """, (user_id, destination))
            result = cursor.fetchone()
            if result:
                plan_id = result.get('id') if isinstance(result, dict) else (result[0] if isinstance(result, (list, tuple)) else None)
                print(f"📊 通过查询获取 plan_id={plan_id}")
        
        # 如果仍然没有 plan_id，说明插入失败
        if not plan_id or plan_id == 0:
            # 检查表是否存在
            cursor.execute("SHOW TABLES LIKE 'travel_plans'")
            table_exists = cursor.fetchone()
            if not table_exists:
                raise ValueError("数据库表 travel_plans 不存在，请先运行 python3 -m app.models.travel_models 创建表")
            
            # 检查是否有插入错误
            cursor.execute("SHOW WARNINGS")
            warnings = cursor.fetchall()
            if warnings:
                warning_msg = "; ".join([str(w) for w in warnings])
                raise ValueError(f"插入旅行规划时出现警告：{warning_msg}")
            
            raise ValueError(f"插入旅行规划失败：无法获取 plan_id。lastrowid={cursor.lastrowid}, affected_rows={affected_rows}。请检查数据库表结构和外键约束。")
        
        print(f"✅ 成功创建旅行规划，plan_id={plan_id}")
        
        # 插入航班信息
        for flight in plan_data.flights:
            insert_flight_sql = """
            INSERT INTO flights (
                user_id, travel_plan_id, departure_airport,
                arrival_airport, departure_time, return_time
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(
                insert_flight_sql,
                (
                    user_id,
                    plan_id,
                    flight.departure_airport,
                    flight.arrival_airport,
                    flight.departure_time,
                    flight.return_time
                )
            )
        
        # 插入居住地址信息（并进行地理编码保存经纬度）
        from app.utils.api_clients import LocationAPIClient
        location_client = LocationAPIClient()
        
        for addr in plan_data.addresses:
            # 处理 city 字段：可能是字符串或对象
            city_value = addr.city
            if isinstance(city_value, dict):
                city_value = city_value.get('name', '')
            elif not isinstance(city_value, str):
                city_value = str(city_value) if city_value else ''
            
            address_value = addr.address or ''
            
            # 对住宿地址进行地理编码，获取经纬度
            latitude = None
            longitude = None
            if city_value and address_value:
                try:
                    full_address = f"{city_value} {address_value}"
                    geo = location_client.geocode(full_address, location=city_value)
                    if geo and isinstance(geo, dict):
                        latitude = geo.get("latitude")
                        longitude = geo.get("longitude")
                        if latitude is not None and longitude is not None:
                            print(f"✅ 住宿地理编码成功：{full_address} -> ({latitude}, {longitude})")
                        else:
                            print(f"⚠️ 住宿地理编码返回空坐标：{full_address}")
                    else:
                        print(f"⚠️ 住宿地理编码失败：{full_address}")
                except Exception as e:
                    print(f"⚠️ 住宿地理编码异常：{full_address} - {str(e)}")
            
            insert_addr_sql = """
            INSERT INTO accommodations (
                user_id, travel_plan_id, city, address, check_in_date, check_out_date, latitude, longitude
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(
                insert_addr_sql,
                (
                    user_id, 
                    plan_id, 
                    city_value, 
                    address_value,
                    addr.check_in_date,
                    addr.check_out_date,
                    latitude,
                    longitude
                )
            )
        
        connection.commit()
        print(f"✅ 旅行规划创建成功并已提交，plan_id={plan_id}")
        return plan_id
    except Exception as e:
        if connection:
            try:
                connection.rollback()
                print("🔄 已回滚事务")
            except Exception as rollback_error:
                print(f"⚠️ 回滚失败：{rollback_error}")
        import traceback
        error_msg = f"❌ 创建旅行规划失败：{e}\n{traceback.format_exc()}"
        print(error_msg)
        raise  # 重新抛出异常，让上层处理
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if connection:
            try:
                connection.close()
            except Exception:
                pass


def get_travel_plan(plan_id: int) -> Optional[Dict[str, Any]]:
    """获取旅行规划详情"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM travel_plans WHERE id = %s", (plan_id,))
        plan = cursor.fetchone()
        
        if not plan:
            return None
        
        # 确保 plan 是字典类型
        if not isinstance(plan, dict):
            print(f"⚠️ 警告：get_travel_plan 返回了非字典类型数据：{type(plan)}")
            return None
        
        # 创建新的字典，避免修改原始数据
        plan_dict = dict(plan)
        
        # 解析JSON字段，添加错误处理
        try:
            if plan_dict.get('interests'):
                if isinstance(plan_dict['interests'], str):
                    plan_dict['interests'] = json.loads(plan_dict['interests'])
                elif not isinstance(plan_dict['interests'], list):
                    plan_dict['interests'] = []
            else:
                plan_dict['interests'] = []
        except Exception as e:
            print(f"⚠️ 解析 interests 失败：{e}")
            plan_dict['interests'] = []
        
        try:
            if plan_dict.get('food_preferences'):
                if isinstance(plan_dict['food_preferences'], str):
                    plan_dict['food_preferences'] = json.loads(plan_dict['food_preferences'])
                elif not isinstance(plan_dict['food_preferences'], list):
                    plan_dict['food_preferences'] = []
            else:
                plan_dict['food_preferences'] = []
        except Exception as e:
            print(f"⚠️ 解析 food_preferences 失败：{e}")
            plan_dict['food_preferences'] = []
        
        try:
            if plan_dict.get('xiaohongshu_notes'):
                if isinstance(plan_dict['xiaohongshu_notes'], str):
                    plan_dict['xiaohongshu_notes'] = json.loads(plan_dict['xiaohongshu_notes'])
                elif not isinstance(plan_dict['xiaohongshu_notes'], list):
                    plan_dict['xiaohongshu_notes'] = []
            else:
                plan_dict['xiaohongshu_notes'] = []
        except Exception as e:
            print(f"⚠️ 解析 xiaohongshu_notes 失败：{e}")
            plan_dict['xiaohongshu_notes'] = []
        
        try:
            if plan_dict.get('addresses'):
                if isinstance(plan_dict['addresses'], str):
                    plan_dict['addresses'] = json.loads(plan_dict['addresses'])
                elif not isinstance(plan_dict['addresses'], list):
                    plan_dict['addresses'] = []
            else:
                plan_dict['addresses'] = []
        except Exception as e:
            print(f"⚠️ 解析 addresses 失败：{e}")
            plan_dict['addresses'] = []
        
        return plan_dict
    except Exception as e:
        print(f"❌ 获取旅行规划失败：{e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        cursor.close()
        connection.close()


def get_user_travel_plans(user_id: int) -> List[Dict[str, Any]]:
    """获取用户的所有旅行规划"""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM travel_plans WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        plans = cursor.fetchall()
        
        # 解析JSON字段
        for plan in plans:
            plan['interests'] = json.loads(plan['interests']) if plan['interests'] else []
            plan['food_preferences'] = json.loads(plan['food_preferences']) if plan['food_preferences'] else []
            plan['xiaohongshu_notes'] = json.loads(plan['xiaohongshu_notes']) if plan['xiaohongshu_notes'] else []
            plan['addresses'] = json.loads(plan['addresses']) if plan['addresses'] else []
        
        return plans
    except Exception as e:
        print(f"❌ 获取用户旅行规划失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()


# ==================== 对话记录 CRUD ====================

def create_conversation(user_id: int, conversation_data: ConversationCreate) -> Optional[int]:
    """创建对话记录"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        insert_sql = """
        INSERT INTO conversation_logs (user_id, travel_plan_id, message, sender)
        VALUES (%s, %s, %s, %s)
        """
        cursor.execute(
            insert_sql,
            (user_id, conversation_data.travel_plan_id, conversation_data.message, conversation_data.sender)
        )
        connection.commit()
        return cursor.lastrowid
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建对话记录失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


def get_conversations_by_plan(travel_plan_id: int) -> List[Dict[str, Any]]:
    """获取指定旅行规划的所有对话记录"""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT * FROM conversation_logs WHERE travel_plan_id = %s ORDER BY timestamp ASC",
            (travel_plan_id,)
        )
        return cursor.fetchall()
    except Exception as e:
        print(f"❌ 获取对话记录失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()


# ==================== 路线规划详情 CRUD ====================

def create_itinerary_detail(
    travel_plan_id: int,
    day_number: int,
    itinerary: Optional[Dict[str, Any]] = None,
    recommended_spots: Optional[List[Dict[str, Any]]] = None,
    recommended_restaurants: Optional[List[Dict[str, Any]]] = None
) -> Optional[int]:
    """创建路线规划详情"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        insert_sql = """
        INSERT INTO itinerary_details (
            travel_plan_id, day_number, itinerary,
            recommended_spots, recommended_restaurants
        ) VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            itinerary = VALUES(itinerary),
            recommended_spots = VALUES(recommended_spots),
            recommended_restaurants = VALUES(recommended_restaurants),
            updated_at = CURRENT_TIMESTAMP
        """
        cursor.execute(
            insert_sql,
            (
                travel_plan_id,
                day_number,
                json.dumps(itinerary, ensure_ascii=False) if itinerary else None,
                json.dumps(recommended_spots, ensure_ascii=False) if recommended_spots else None,
                json.dumps(recommended_restaurants, ensure_ascii=False) if recommended_restaurants else None
            )
        )
        connection.commit()
        return cursor.lastrowid
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建路线规划详情失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


def get_itinerary_details(travel_plan_id: int) -> List[Dict[str, Any]]:
    """获取旅行规划的所有路线详情"""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT * FROM itinerary_details WHERE travel_plan_id = %s ORDER BY day_number ASC",
            (travel_plan_id,)
        )
        details = cursor.fetchall()
        
        # 解析JSON字段
        for detail in details:
            detail['itinerary'] = json.loads(detail['itinerary']) if detail['itinerary'] else {}
            detail['recommended_spots'] = json.loads(detail['recommended_spots']) if detail['recommended_spots'] else []
            detail['recommended_restaurants'] = json.loads(detail['recommended_restaurants']) if detail['recommended_restaurants'] else []
        
        return details
    except Exception as e:
        print(f"❌ 获取路线规划详情失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()


# ==================== 景点 CRUD ====================

def create_attraction(
    name: str,
    address: Optional[str] = None,
    description: Optional[str] = None,
    image_url: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
    country: Optional[str] = None
) -> Optional[int]:
    """创建景点"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        insert_sql = """
        INSERT INTO attractions (
            name, address, description, image_url,
            latitude, longitude, city, country
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(
            insert_sql,
            (name, address, description, image_url, latitude, longitude, city, country)
        )
        connection.commit()
        return cursor.lastrowid
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建景点失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


def search_attractions(city: Optional[str] = None, keyword: Optional[str] = None) -> List[Dict[str, Any]]:
    """搜索景点"""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor()
        if city:
            cursor.execute(
                "SELECT * FROM attractions WHERE city = %s ORDER BY id DESC LIMIT 50",
                (city,)
            )
        elif keyword:
            cursor.execute(
                "SELECT * FROM attractions WHERE name LIKE %s OR description LIKE %s ORDER BY id DESC LIMIT 50",
                (f"%{keyword}%", f"%{keyword}%")
            )
        else:
            cursor.execute("SELECT * FROM attractions ORDER BY id DESC LIMIT 50")
        
        return cursor.fetchall()
    except Exception as e:
        print(f"❌ 搜索景点失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()


# ==================== 餐厅 CRUD ====================

def create_restaurant(
    name: str,
    address: Optional[str] = None,
    description: Optional[str] = None,
    image_url: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
    country: Optional[str] = None,
    cuisine_type: Optional[str] = None,
    price_level: Optional[str] = None
) -> Optional[int]:
    """创建餐厅"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        insert_sql = """
        INSERT INTO restaurants (
            name, address, description, image_url,
            latitude, longitude, city, country,
            cuisine_type, price_level
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(
            insert_sql,
            (name, address, description, image_url, latitude, longitude, city, country, cuisine_type, price_level)
        )
        connection.commit()
        return cursor.lastrowid
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建餐厅失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


def search_restaurants(
    city: Optional[str] = None,
    cuisine_type: Optional[str] = None,
    keyword: Optional[str] = None
) -> List[Dict[str, Any]]:
    """搜索餐厅"""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor()
        conditions = []
        params = []
        
        if city:
            conditions.append("city = %s")
            params.append(city)
        if cuisine_type:
            conditions.append("cuisine_type = %s")
            params.append(cuisine_type)
        if keyword:
            conditions.append("(name LIKE %s OR description LIKE %s)")
            params.extend([f"%{keyword}%", f"%{keyword}%"])
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        sql = f"SELECT * FROM restaurants WHERE {where_clause} ORDER BY id DESC LIMIT 50"
        
        cursor.execute(sql, params)
        return cursor.fetchall()
    except Exception as e:
        print(f"❌ 搜索餐厅失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()


# ==================== 航班与住宿查询 ====================

def get_flights_by_plan(travel_plan_id: int) -> List[Dict[str, Any]]:
    """根据旅行规划ID获取航班信息"""
    connection = get_db_connection()
    if not connection:
        return []

    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT * FROM flights WHERE travel_plan_id = %s ORDER BY id ASC",
            (travel_plan_id,),
        )
        results = cursor.fetchall()
        # 确保返回的是字典列表，并处理日期时间格式
        flights = []
        for row in results:
            if isinstance(row, dict):
                # 确保日期时间字段是字符串格式（如果数据库返回的是 datetime 对象）
                flight = dict(row)
                if flight.get("departure_time") and hasattr(flight["departure_time"], "isoformat"):
                    flight["departure_time"] = flight["departure_time"].isoformat()
                if flight.get("return_time") and hasattr(flight["return_time"], "isoformat"):
                    flight["return_time"] = flight["return_time"].isoformat()
                flights.append(flight)
            elif isinstance(row, (list, tuple)):
                # 如果返回的是元组/列表，转换为字典（这种情况不应该发生，但作为容错处理）
                print(f"⚠️ 警告：flights 返回了非字典类型数据：{type(row)}")
        return flights
    except Exception as e:
        print(f"❌ 获取航班信息失败：{e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        cursor.close()
        connection.close()


def get_accommodations_by_plan(travel_plan_id: int) -> List[Dict[str, Any]]:
    """根据旅行规划ID获取住宿信息"""
    connection = get_db_connection()
    if not connection:
        return []

    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT * FROM accommodations WHERE travel_plan_id = %s ORDER BY id ASC",
            (travel_plan_id,),
        )
        results = cursor.fetchall()
        # 确保返回的是字典列表，并处理日期格式
        accommodations = []
        for row in results:
            if isinstance(row, dict):
                # 确保日期字段是字符串格式（如果数据库返回的是 date 对象）
                acc = dict(row)
                if acc.get("check_in_date") and hasattr(acc["check_in_date"], "isoformat"):
                    acc["check_in_date"] = acc["check_in_date"].isoformat()
                if acc.get("check_out_date") and hasattr(acc["check_out_date"], "isoformat"):
                    acc["check_out_date"] = acc["check_out_date"].isoformat()
                accommodations.append(acc)
            elif isinstance(row, (list, tuple)):
                # 如果返回的是元组/列表，转换为字典（这种情况不应该发生，但作为容错处理）
                print(f"⚠️ 警告：accommodations 返回了非字典类型数据：{type(row)}")
        return accommodations
    except Exception as e:
        print(f"❌ 获取住宿信息失败：{e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        cursor.close()
        connection.close()
