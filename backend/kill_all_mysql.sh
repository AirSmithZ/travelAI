#!/bin/bash
# 终止所有 MySQL 进程并清理

echo "=== 终止所有 MySQL 进程 ==="

# 1. 查找所有 MySQL 进程
echo "1. 查找所有 MySQL 进程..."
MYSQL_PIDS=$(pgrep -x mysqld)
if [ -n "$MYSQL_PIDS" ]; then
    echo "发现以下 MySQL 进程："
    ps aux | grep mysqld | grep -v grep
    echo ""
    echo "正在终止所有 MySQL 进程..."
    for pid in $MYSQL_PIDS; do
        echo "终止进程: $pid"
        sudo kill -9 $pid
    done
    sleep 2
    echo "✅ 所有 MySQL 进程已终止"
else
    echo "✅ 没有运行中的 MySQL 进程"
fi

# 2. 检查是否还有进程占用数据文件
echo -e "\n2. 检查是否还有进程占用数据文件..."
if command -v lsof &> /dev/null; then
    # 检查两个可能的数据目录
    for data_dir in "/usr/local/mysql/data" "/usr/local/mysql-9.5.0-macos15-arm64/data"; do
        if [ -d "$data_dir" ]; then
            echo "检查目录: $data_dir"
            LOCKED=$(sudo lsof "$data_dir/ibdata1" 2>/dev/null | grep -v COMMAND)
            if [ -n "$LOCKED" ]; then
                echo "⚠️ 发现进程占用:"
                echo "$LOCKED"
                echo "正在终止这些进程..."
                PIDS=$(echo "$LOCKED" | awk '{print $2}' | sort -u)
                for pid in $PIDS; do
                    if [ "$pid" != "PID" ]; then
                        echo "终止进程: $pid"
                        sudo kill -9 $pid 2>/dev/null
                    fi
                done
            else
                echo "✅ 没有进程占用 $data_dir/ibdata1"
            fi
        fi
    done
fi

# 3. 删除所有锁文件
echo -e "\n3. 删除所有锁文件..."
for data_dir in "/usr/local/mysql/data" "/usr/local/mysql-9.5.0-macos15-arm64/data"; do
    if [ -d "$data_dir" ]; then
        echo "清理目录: $data_dir"
        sudo rm -f "$data_dir"/*.pid
        sudo rm -f "$data_dir"/*.lock
        echo "✅ 已清理 $data_dir"
    fi
done

echo -e "\n✅ 清理完成！现在可以尝试启动 MySQL："
echo "sudo /usr/local/mysql/support-files/mysql.server start"
