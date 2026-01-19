import pymysql
from pymysql import Error
from datetime import datetime
from typing import Optional
import json
from app.config import settings


def get_db_connection():
    """获取数据库连接"""
    try:
        connection = pymysql.connect(
            host=settings.DB_HOST,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            port=settings.DB_PORT,
            charset=settings.DB_CHARSET,
            cursorclass=pymysql.cursors.DictCursor
        )
        return connection
    except Error as e:
        print(f"❌ 数据库连接失败：{e}")
        return None


def create_all_tables():
    """创建所有数据库表"""
    connection = get_db_connection()
    if not connection:
        return False
    
    try:
        cursor = connection.cursor()
        
        # 1. 用户表（简化版，实际项目中应该有完整的用户认证）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
        """)
        
        # 2. 旅行规划表
        cursor.execute("""
            DROP TABLE IF EXISTS travel_plans
        """)
        cursor.execute("""
            CREATE TABLE travel_plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                destination VARCHAR(100) NOT NULL COMMENT '目的地',
                budget_min DECIMAL(10,2) DEFAULT 0 COMMENT '预算下限',
                budget_max DECIMAL(10,2) DEFAULT 0 COMMENT '预算上限',
                interests JSON COMMENT '旅行偏好，存储为JSON数组',
                food_preferences JSON COMMENT '饮食偏好，存储为JSON数组',
                travelers VARCHAR(50) COMMENT '出行人数及类型',
                xiaohongshu_notes JSON COMMENT '小红书笔记链接，存储为JSON数组',
                addresses JSON COMMENT '居住地址信息，存储为JSON数组',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_destination (destination)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='旅行规划表'
        """)
        
        # 3. 对话记录表
        cursor.execute("""
            DROP TABLE IF EXISTS conversation_logs
        """)
        cursor.execute("""
            CREATE TABLE conversation_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                travel_plan_id INT COMMENT '旅行规划ID',
                message TEXT NOT NULL COMMENT '对话内容',
                sender ENUM('user', 'system') NOT NULL COMMENT '发送者类型',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '对话时间戳',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_travel_plan_id (travel_plan_id),
                INDEX idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对话记录表'
        """)
        
        # 4. 路线规划详情表
        cursor.execute("""
            DROP TABLE IF EXISTS itinerary_details
        """)
        cursor.execute("""
            CREATE TABLE itinerary_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                travel_plan_id INT NOT NULL COMMENT '旅行规划ID',
                day_number INT NOT NULL COMMENT '第几天',
                itinerary JSON COMMENT '每天的行程安排，存储为JSON',
                recommended_spots JSON COMMENT '推荐景点，存储为JSON数组',
                recommended_restaurants JSON COMMENT '推荐餐厅，存储为JSON数组',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE,
                INDEX idx_travel_plan_id (travel_plan_id),
                INDEX idx_day_number (day_number),
                UNIQUE KEY uk_plan_day (travel_plan_id, day_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='路线规划详情表'
        """)
        
        # 5. 景点表
        cursor.execute("""
            DROP TABLE IF EXISTS attractions
        """)
        cursor.execute("""
            CREATE TABLE attractions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(200) NOT NULL COMMENT '景点名称',
                address VARCHAR(500) COMMENT '景点地址',
                description TEXT COMMENT '景点简介',
                image_url VARCHAR(500) COMMENT '图片链接',
                latitude DECIMAL(10,8) COMMENT '纬度',
                longitude DECIMAL(11,8) COMMENT '经度',
                city VARCHAR(100) COMMENT '所在城市',
                country VARCHAR(100) COMMENT '所在国家',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                INDEX idx_city (city),
                INDEX idx_location (latitude, longitude)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='景点表'
        """)
        
        # 6. 餐厅表
        cursor.execute("""
            DROP TABLE IF EXISTS restaurants
        """)
        cursor.execute("""
            CREATE TABLE restaurants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(200) NOT NULL COMMENT '餐厅名称',
                address VARCHAR(500) COMMENT '餐厅地址',
                description TEXT COMMENT '餐厅简介',
                image_url VARCHAR(500) COMMENT '图片链接',
                latitude DECIMAL(10,8) COMMENT '纬度',
                longitude DECIMAL(11,8) COMMENT '经度',
                city VARCHAR(100) COMMENT '所在城市',
                country VARCHAR(100) COMMENT '所在国家',
                cuisine_type VARCHAR(100) COMMENT '菜系类型',
                price_level VARCHAR(20) COMMENT '价格等级',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                INDEX idx_city (city),
                INDEX idx_location (latitude, longitude),
                INDEX idx_cuisine (cuisine_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='餐厅表'
        """)
        
        # 7. 航班表
        cursor.execute("""
            DROP TABLE IF EXISTS flights
        """)
        cursor.execute("""
            CREATE TABLE flights (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                travel_plan_id INT COMMENT '旅行规划ID',
                departure_airport VARCHAR(200) NOT NULL COMMENT '出发机场',
                arrival_airport VARCHAR(200) NOT NULL COMMENT '到达机场',
                departure_time DATETIME NOT NULL COMMENT '出发时间',
                return_time DATETIME COMMENT '返回时间',
                latitude DECIMAL(10,8) COMMENT '机场纬度',
                longitude DECIMAL(11,8) COMMENT '机场经度',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_travel_plan_id (travel_plan_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='航班表'
        """)
        
        # 8. 居住表
        cursor.execute("""
            DROP TABLE IF EXISTS accommodations
        """)
        cursor.execute("""
            CREATE TABLE accommodations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                travel_plan_id INT COMMENT '旅行规划ID',
                city VARCHAR(100) NOT NULL COMMENT '城市',
                address VARCHAR(500) NOT NULL COMMENT '居住地址',
                latitude DECIMAL(10,8) COMMENT '纬度',
                longitude DECIMAL(11,8) COMMENT '经度',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_travel_plan_id (travel_plan_id),
                INDEX idx_city (city)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='居住表'
        """)
        
        connection.commit()
        print("✅ 所有数据库表创建成功")
        return True
        
    except Error as e:
        connection.rollback()
        print(f"❌ 创建表失败：{e}")
        return False
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    create_all_tables()
