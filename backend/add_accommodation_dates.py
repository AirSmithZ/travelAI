#!/usr/bin/env python3
"""
迁移脚本：为 accommodations 表添加 check_in_date 和 check_out_date 字段
"""
import pymysql
from app.config import settings
from app.models.travel_models import get_db_connection


def add_accommodation_date_fields():
    """为 accommodations 表添加日期字段"""
    connection = get_db_connection()
    if not connection:
        print("❌ 数据库连接失败")
        return False
    
    try:
        cursor = connection.cursor()
        
        # 检查字段是否已存在
        cursor.execute("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = %s 
            AND TABLE_NAME = 'accommodations' 
            AND COLUMN_NAME IN ('check_in_date', 'check_out_date')
        """, (settings.DB_NAME,))
        
        existing_fields = [row['COLUMN_NAME'] for row in cursor.fetchall()]
        
        # 添加 check_in_date 字段（如果不存在）
        if 'check_in_date' not in existing_fields:
            print("📝 添加 check_in_date 字段...")
            cursor.execute("""
                ALTER TABLE accommodations 
                ADD COLUMN check_in_date DATE COMMENT '入住日期' AFTER address
            """)
            print("✅ check_in_date 字段添加成功")
        else:
            print("ℹ️  check_in_date 字段已存在，跳过")
        
        # 添加 check_out_date 字段（如果不存在）
        if 'check_out_date' not in existing_fields:
            print("📝 添加 check_out_date 字段...")
            cursor.execute("""
                ALTER TABLE accommodations 
                ADD COLUMN check_out_date DATE COMMENT '退房日期' AFTER check_in_date
            """)
            print("✅ check_out_date 字段添加成功")
        else:
            print("ℹ️  check_out_date 字段已存在，跳过")
        
        # 添加索引（如果不存在）
        cursor.execute("""
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = %s 
            AND TABLE_NAME = 'accommodations' 
            AND INDEX_NAME = 'idx_check_in_date'
        """, (settings.DB_NAME,))
        
        if not cursor.fetchone():
            print("📝 添加 check_in_date 索引...")
            cursor.execute("""
                ALTER TABLE accommodations 
                ADD INDEX idx_check_in_date (check_in_date)
            """)
            print("✅ 索引添加成功")
        else:
            print("ℹ️  索引已存在，跳过")
        
        connection.commit()
        print("\n✅ 迁移完成！")
        return True
        
    except Exception as e:
        connection.rollback()
        print(f"❌ 迁移失败：{e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    print("开始迁移 accommodations 表...")
    add_accommodation_date_fields()
