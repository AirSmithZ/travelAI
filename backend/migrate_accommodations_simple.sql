-- 简单的迁移脚本：为 accommodations 表添加 check_in_date 和 check_out_date 字段
-- 如果字段已存在，执行会报错，可以忽略

-- 添加 check_in_date 字段
ALTER TABLE accommodations 
ADD COLUMN check_in_date DATE COMMENT '入住日期' AFTER address;

-- 添加 check_out_date 字段
ALTER TABLE accommodations 
ADD COLUMN check_out_date DATE COMMENT '退房日期' AFTER check_in_date;

-- 添加索引
ALTER TABLE accommodations 
ADD INDEX idx_check_in_date (check_in_date);
