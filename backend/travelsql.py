import pymysql
from pymysql import Error
from datetime import date

# ---------------------- 1. 基础配置（确认密码正确！） ----------------------
DB_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "19961001",  # 替换成你重置后的MySQL密码
    "database": "travel",    # 你的数据库名
    "port": 3306,
    "charset": "utf8mb4"
}

# ---------------------- 2. 连接数据库 ----------------------
def get_db_connection():
    connection = None
    try:
        connection = pymysql.connect(**DB_CONFIG)
        print("✅ 成功连接到 travel 数据库")
    except Error as e:
        print(f"❌ 数据库连接失败：{e}")
    return connection

# ---------------------- 3. 创建表（拆分DROP和CREATE，适配MySQL 9.5） ----------------------
def create_travel_plan_table():
    connection = get_db_connection()
    if not connection:
        return
    
    try:
        cursor = connection.cursor()
        # 步骤1：先删除旧表（单独执行，避免语法冲突）
        drop_sql = "DROP TABLE IF EXISTS travel_plan"
        cursor.execute(drop_sql)
        
        # 步骤2：创建新表（简化换行，适配MySQL 9.5语法）
        create_sql = """
        CREATE TABLE travel_plan (
            id INT AUTO_INCREMENT PRIMARY KEY,
            plan_name VARCHAR(100) NOT NULL COMMENT '旅行计划名称',
            start_date DATE NOT NULL COMMENT '出发日期',
            end_date DATE NOT NULL COMMENT '结束日期',
            destination VARCHAR(50) NOT NULL COMMENT '目的地',
            budget DECIMAL(10,2) NOT NULL COMMENT '预算金额',
            is_completed TINYINT(1) DEFAULT 0 COMMENT '是否完成：0=未完成，1=已完成'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='旅行计划表'
        """
        cursor.execute(create_sql)
        connection.commit()
        print("✅ travel_plan 表创建成功")
    except Error as e:
        connection.rollback()
        print(f"❌ 创建表失败：{e}")
    finally:
        cursor.close()
        connection.close()

# ---------------------- 4. 新增数据 ----------------------
def add_travel_plan(plan_name, start_date, end_date, destination, budget):
    connection = get_db_connection()
    if not connection:
        return
    
    try:
        cursor = connection.cursor()
        insert_sql = """
        INSERT INTO travel_plan (plan_name, start_date, end_date, destination, budget)
        VALUES (%s, %s, %s, %s, %s)
        """
        data = (plan_name, start_date, end_date, destination, budget)
        cursor.execute(insert_sql, data)
        connection.commit()
        print(f"✅ 新增旅行计划成功，计划ID：{cursor.lastrowid}")
    except Error as e:
        connection.rollback()
        print(f"❌ 新增计划失败：{e}")
    finally:
        cursor.close()
        connection.close()

# ---------------------- 5. 查询数据 ----------------------
def query_all_travel_plans():
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor(pymysql.cursors.DictCursor)  # 显式指定字典游标
        cursor.execute("SELECT * FROM travel_plan")
        results = cursor.fetchall()
        print(f"\n📊 查询到 {len(results)} 条旅行计划：")
        for plan in results:
            print(f"ID：{plan['id']} | 名称：{plan['plan_name']} | 目的地：{plan['destination']} | 预算：{plan['budget']}元")
        return results
    except Error as e:
        print(f"❌ 查询计划失败：{e}")
        return []
    finally:
        cursor.close()
        connection.close()

# ---------------------- 执行流程 ----------------------
if __name__ == "__main__":
    create_travel_plan_table()
    add_travel_plan(
        plan_name="春节三亚亲子游",
        start_date=date(2026, 2, 10),
        end_date=date(2026, 2, 15),
        destination="海南三亚",
        budget=8000.00
    )
    query_all_travel_plans()