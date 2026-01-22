#!/bin/bash
# MySQL 启动故障排查脚本

echo "=== MySQL 启动故障排查 ==="

# 1. 检查数据目录权限
echo "1. 检查数据目录权限..."
DATA_DIR="/usr/local/mysql/data"
if [ -d "$DATA_DIR" ]; then
    echo "数据目录: $DATA_DIR"
    ls -ld "$DATA_DIR" | head -1
else
    echo "❌ 数据目录不存在: $DATA_DIR"
fi

# 2. 检查 PID 文件
echo -e "\n2. 检查 PID 文件..."
PID_FILE="/usr/local/mysql/data/azhoudeLaptop.local.pid"
if [ -f "$PID_FILE" ]; then
    echo "⚠️ 发现旧的 PID 文件，尝试删除..."
    sudo rm -f "$PID_FILE"
    echo "✅ PID 文件已删除"
else
    echo "✅ 没有旧的 PID 文件"
fi

# 3. 检查端口占用
echo -e "\n3. 检查端口 3306 占用情况..."
if lsof -i :3306 2>/dev/null | grep -q LISTEN; then
    echo "⚠️ 端口 3306 已被占用"
    lsof -i :3306 | grep LISTEN
else
    echo "✅ 端口 3306 未被占用"
fi

# 4. 检查 MySQL 进程
echo -e "\n4. 检查 MySQL 进程..."
if pgrep -x mysqld > /dev/null; then
    echo "⚠️ 发现 MySQL 进程正在运行"
    ps aux | grep mysqld | grep -v grep
else
    echo "✅ 没有运行中的 MySQL 进程"
fi

# 5. 尝试启动 MySQL
echo -e "\n5. 尝试启动 MySQL..."
echo "执行: sudo /usr/local/mysql/support-files/mysql.server start"
echo ""
echo "如果仍然失败，请检查错误日志："
echo "sudo tail -50 /usr/local/mysql/data/azhoudeLaptop.local.err"
