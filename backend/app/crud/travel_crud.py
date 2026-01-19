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
        return None
    
    try:
        cursor = connection.cursor()
        
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
        
        values = (
            user_id,
            destination,
            plan_data.budget.min,
            plan_data.budget.max,
            json.dumps(plan_data.interests, ensure_ascii=False),
            json.dumps(plan_data.food_preferences, ensure_ascii=False),
            plan_data.travelers,
            json.dumps(plan_data.xiaohongshu_notes, ensure_ascii=False),
            json.dumps([addr.dict() for addr in plan_data.addresses], ensure_ascii=False)
        )
        
        cursor.execute(insert_sql, values)
        plan_id = cursor.lastrowid
        
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
        
        # 插入居住地址信息
        for addr in plan_data.addresses:
            insert_addr_sql = """
            INSERT INTO accommodations (
                user_id, travel_plan_id, city, address
            ) VALUES (%s, %s, %s, %s)
            """
            cursor.execute(
                insert_addr_sql,
                (user_id, plan_id, addr.city, addr.address)
            )
        
        connection.commit()
        return plan_id
    except Exception as e:
        connection.rollback()
        print(f"❌ 创建旅行规划失败：{e}")
        return None
    finally:
        cursor.close()
        connection.close()


def get_travel_plan(plan_id: int) -> Optional[Dict[str, Any]]:
    """获取旅行规划详情"""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM travel_plans WHERE id = %s", (plan_id,))
        plan = cursor.fetchone()
        
        if plan:
            # 解析JSON字段
            plan['interests'] = json.loads(plan['interests']) if plan['interests'] else []
            plan['food_preferences'] = json.loads(plan['food_preferences']) if plan['food_preferences'] else []
            plan['xiaohongshu_notes'] = json.loads(plan['xiaohongshu_notes']) if plan['xiaohongshu_notes'] else []
            plan['addresses'] = json.loads(plan['addresses']) if plan['addresses'] else []
        
        return plan
    except Exception as e:
        print(f"❌ 获取旅行规划失败：{e}")
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
        return cursor.fetchall()
    except Exception as e:
        print(f"❌ 获取航班信息失败：{e}")
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
        return cursor.fetchall()
    except Exception as e:
        print(f"❌ 获取住宿信息失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()
