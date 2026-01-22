#!/bin/bash
# 修改 MySQL root 用户认证方式为 mysql_native_password

echo "=== 修改 MySQL root 用户认证方式 ==="
echo ""
echo "这将修改 root 用户的认证方式为 mysql_native_password（不需要 cryptography 包）"
echo ""
echo "请执行以下命令："
echo ""
echo "1. 连接到 MySQL（使用当前密码 123456）："
echo "   mysql -u root -p123456"
echo ""
echo "2. 在 MySQL 中执行以下 SQL："
echo "   ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';"
echo "   FLUSH PRIVILEGES;"
echo "   exit;"
echo ""
echo "或者直接执行："
echo "mysql -u root -p123456 -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456'; FLUSH PRIVILEGES;\""
