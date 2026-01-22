-- 在 Navicat 中执行此 SQL 创建新用户
-- 这个用户使用 MySQL 9.5 的默认认证方式，应该可以正常工作

CREATE USER IF NOT EXISTS 'travel_user'@'localhost' IDENTIFIED BY '123456';
GRANT ALL PRIVILEGES ON travel.* TO 'travel_user'@'localhost';
FLUSH PRIVILEGES;

-- 验证用户创建成功
SELECT user, host, plugin FROM mysql.user WHERE user = 'travel_user';
