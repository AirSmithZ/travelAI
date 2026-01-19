#!/usr/bin/env python3
"""
启动Celery Worker脚本
"""
from app.tasks import celery_app

if __name__ == "__main__":
    celery_app.start()
