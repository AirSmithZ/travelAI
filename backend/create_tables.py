#!/usr/bin/env python3
"""
创建数据库表的独立脚本
不依赖 pydantic_settings，直接读取环境变量
"""
import os
import sys
import pymysql
from pymysql import Error

# 从环境变量读取配置
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123456")
DB_NAME = os.getenv("DB_NAME", "travel")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_CHARSET = os.getenv("DB_CHARSET", "utf8mb4")

def get_db_connection():
    """获取数据库连接"""
    try:
        # 尝试使用 mysql_native_password 认证（不需要 cryptography）
        connection = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            port=DB_PORT,
            charset=DB_CHARSET,
            cursorclass=pymysql.cursors.DictCursor,
            # 尝试使用 TCP 连接而不是 socket
            unix_socket=None
        )
        return connection
    except Error as e:
        error_msg = str(e)
        if 'cryptography' in error_msg or 'caching_sha2_password' in error_msg:
            print(f"❌ 数据库连接失败：需要修改 MySQL root 用户认证方式")
            print(f"   请执行: mysql -u root -p123456 -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456'; FLUSH PRIVILEGES;\"")
        else:
            print(f"❌ 数据库连接失败：{e}")
        return None

def create_all_tables():
    """创建所有数据库表"""
    connection = get_db_connection()
    if not connection:
        print("❌ 无法连接到数据库，请检查配置和 MySQL 服务状态")
        return False
    
    try:
        cursor = connection.cursor()
        
        # 1. 用户表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
        """)
        print("✅ 用户表创建/检查完成")
        
        # 2. 旅行规划表
        cursor.execute("DROP TABLE IF EXISTS travel_plans")
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
        print("✅ 旅行规划表创建完成")
        
        # 3. 对话记录表
        cursor.execute("DROP TABLE IF EXISTS conversation_logs")
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
        print("✅ 对话记录表创建完成")
        
        # 4. 路线详情表
        cursor.execute("DROP TABLE IF EXISTS itinerary_details")
        cursor.execute("""
            CREATE TABLE itinerary_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                travel_plan_id INT NOT NULL COMMENT '旅行规划ID',
                day_number INT NOT NULL COMMENT '天数',
                itinerary JSON COMMENT '路线详情，存储为JSON',
                recommended_spots JSON COMMENT '推荐景点，存储为JSON数组',
                recommended_restaurants JSON COMMENT '推荐餐厅，存储为JSON数组',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE CASCADE,
                INDEX idx_travel_plan_id (travel_plan_id),
                INDEX idx_day_number (day_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='路线详情表'
        """)
        print("✅ 路线详情表创建完成")
        
        # 5. 航班表
        cursor.execute("DROP TABLE IF EXISTS flights")
        cursor.execute("""
            CREATE TABLE flights (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                travel_plan_id INT COMMENT '旅行规划ID',
                departure_airport VARCHAR(100) NOT NULL COMMENT '出发机场',
                arrival_airport VARCHAR(100) NOT NULL COMMENT '到达机场',
                departure_time DATETIME NOT NULL COMMENT '出发时间',
                return_time DATETIME COMMENT '返回时间',
                latitude DECIMAL(10,8) COMMENT '纬度',
                longitude DECIMAL(11,8) COMMENT '经度',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_travel_plan_id (travel_plan_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='航班表'
        """)
        print("✅ 航班表创建完成")
        
        # 6. 居住表
        cursor.execute("DROP TABLE IF EXISTS accommodations")
        cursor.execute("""
            CREATE TABLE accommodations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL COMMENT '用户ID',
                travel_plan_id INT COMMENT '旅行规划ID',
                city VARCHAR(100) NOT NULL COMMENT '城市',
                address VARCHAR(500) NOT NULL COMMENT '居住地址',
                check_in_date DATE COMMENT '入住日期',
                check_out_date DATE COMMENT '退房日期',
                latitude DECIMAL(10,8) COMMENT '纬度',
                longitude DECIMAL(11,8) COMMENT '经度',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (travel_plan_id) REFERENCES travel_plans(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_travel_plan_id (travel_plan_id),
                INDEX idx_city (city),
                INDEX idx_check_in_date (check_in_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='居住表'
        """)
        print("✅ 居住表创建完成")
        
        # 创建默认用户
        cursor.execute("INSERT IGNORE INTO users (id, username, email) VALUES (1, 'default_user', 'default@example.com')")
        print("✅ 默认用户创建完成")
        
        connection.commit()
        print("\n✅ 所有数据库表创建成功！")
        return True
        
    except Error as e:
        connection.rollback()
        print(f"❌ 创建表失败：{e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        cursor.close()
        connection.close()

if __name__ == "__main__":
    print("开始创建数据库表...")
    print(f"数据库配置: {DB_HOST}:{DB_PORT}/{DB_NAME} (用户: {DB_USER})")
    print()
    success = create_all_tables()
    sys.exit(0 if success else 1)
