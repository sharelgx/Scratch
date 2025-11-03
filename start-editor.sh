#!/bin/bash
# Scratch Editor 隔离启动脚本

cd "$(dirname "$0")/packages/scratch-gui"

# 使用项目本地的 npm
# 确保端口是 8601（不与其他项目冲突）
export PORT=${PORT:-8601}

# 增加 Node.js 内存限制（避免编译时内存溢出）
export NODE_OPTIONS="--max_old_space_size=8192"

echo "🔒 启动 Scratch Editor（完全隔离模式）"
echo "端口: $PORT"
echo "内存限制: 8GB"
echo "访问: http://localhost:$PORT"
echo ""

npm start
