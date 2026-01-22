#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate

# 升级 pip 和构建工具，确保能正确安装包含 C 扩展的包
echo "📦 升级 pip 和构建工具..."
pip install --upgrade pip setuptools wheel

# 先尝试安装 lxml（可能需要编译，单独处理）
echo ""
echo "📦 正在安装 lxml（可能需要几分钟，请耐心等待）..."
echo "   如果卡在 'Building wheel'，这是正常的，请等待编译完成（5-10分钟）"
echo ""

# 尝试安装最新版本的 lxml（可能有预编译 wheel）
if pip install --upgrade lxml 2>&1 | grep -q "Building wheel"; then
    echo "⚠️  正在从源码编译 lxml，这可能需要几分钟..."
    echo "   请耐心等待，可以查看 CPU 使用率确认是否在编译"
fi

# 安装其他依赖
echo ""
echo "📦 安装其他依赖..."
pip install -r requirements.txt

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

