#!/bin/bash
# 修复 MySQL ibdata1 锁定问题

echo "=== 修复 MySQL ibdata1 锁定问题 ==="

# 1. 查找所有 MySQL 进程
echo "1. 查找所有 MySQL 进程..."
MYSQL_PIDS=$(pgrep -x mysqld)
if [ -n "$MYSQL_PIDS" ]; then
    echo "⚠️ 发现 MySQL 进程："
    ps aux | grep mysqld | grep -v grep
    echo ""
    echo "是否要终止这些进程？(y/n)"
    read -r answer
    if [ "$answer" = "y" ]; then
        echo "正在终止 MySQL 进程..."
        sudo kill -9 $MYSQL_PIDS
        sleep 2
        echo "✅ MySQL 进程已终止"
    fi
else
    echo "✅ 没有运行中的 MySQL 进程"
fi

# 2. 查找并删除锁文件
echo -e "\n2. 查找并删除锁文件..."
DATA_DIR="/usr/local/mysql/data"
LOCK_FILES=(
    "$DATA_DIR/ibdata1.lock"
    "$DATA_DIR/ib_logfile0.lock"
    "$DATA_DIR/ib_logfile1.lock"
    "$DATA_DIR/azhoudeLaptop.local.pid"
)

for lock_file in "${LOCK_FILES[@]}"; do
    if [ -f "$lock_file" ]; then
        echo "发现锁文件: $lock_file"
        sudo rm -f "$lock_file"
        echo "✅ 已删除: $lock_file"
    fi
done

# 3. 检查 lsof 查看是否有进程占用 ibdata1
echo -e "\n3. 检查是否有进程占用 ibdata1..."
if command -v lsof &> /dev/null; then
    LOCKED_PROCESSES=$(sudo lsof "$DATA_DIR/ibdata1" 2>/dev/null)
    if [ -n "$LOCKED_PROCESSES" ]; then
        echo "⚠️ 发现进程占用 ibdata1:"
        echo "$LOCKED_PROCESSES"
    else
        echo "✅ 没有进程占用 ibdata1"
    fi
fi

# 4. 尝试启动 MySQL
echo -e "\n4. 现在可以尝试启动 MySQL:"
echo "sudo /usr/local/mysql/support-files/mysql.server start"
