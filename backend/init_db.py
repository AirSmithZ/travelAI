#!/usr/bin/env python3
"""
初始化数据库脚本
"""
from app.models import create_all_tables
from app.models.travel_models import get_db_connection

if __name__ == "__main__":
    print("🚀 开始初始化数据库...")
    success = create_all_tables()
    if success:
        # 写入默认用户 id=1，便于当前阶段固定 user_id=1
        try:
            conn = get_db_connection()
            if conn:
                cur = conn.cursor()
                cur.execute("SELECT id FROM users WHERE id = 1")
                row = cur.fetchone()
                if not row:
                    cur.execute(
                        "INSERT INTO users (id, username, email) VALUES (1, %s, %s)",
                        ("user1", "user1@example.com"),
                    )
                    conn.commit()
                cur.close()
                conn.close()
        except Exception as e:
            print(f"⚠️ 写入默认用户失败：{e}")
        print("✅ 数据库初始化完成！")
    else:
        print("❌ 数据库初始化失败，请检查配置和连接。")
