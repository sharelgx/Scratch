#!/bin/bash
# Scratch Editor 完全隔离安装脚本
# 确保不影响 /home/sharelgx 下其他项目

set -e  # 遇到错误立即退出

echo "🔒 Scratch Editor 完全隔离安装"
echo "════════════════════════════════════════"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 工作目录: $SCRIPT_DIR"
echo ""

# 1. 创建隔离配置
echo "1️⃣  创建隔离配置文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# .npmrc - 确保所有包安装在项目内
cat > .npmrc << 'EOF'
# Scratch Editor 隔离配置
# 所有全局命令也安装在项目内，不污染系统全局环境
prefix=${PWD}/node_modules/.global
EOF
echo "✅ .npmrc 已创建（包安装在项目内）"

# 创建日志目录
mkdir -p logs

echo ""

# 2. 检查 Node.js 版本
echo "2️⃣  检查 Node.js 版本..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CURRENT_NODE=$(node --version 2>/dev/null || echo "未安装")
REQUIRED_NODE=$(cat .nvmrc 2>/dev/null || echo "")

echo "当前 Node 版本: $CURRENT_NODE"
if [ -n "$REQUIRED_NODE" ]; then
    echo "项目要求版本: v$REQUIRED_NODE"
    if [ "$CURRENT_NODE" != "v$REQUIRED_NODE" ] && [ -n "$NVM_DIR" ]; then
        echo "⚠️  版本不匹配，尝试使用 nvm..."
        if command -v nvm >/dev/null 2>&1; then
            source "$NVM_DIR/nvm.sh" 2>/dev/null || true
            nvm use "$REQUIRED_NODE" 2>/dev/null || nvm install "$REQUIRED_NODE"
        fi
    fi
fi

echo ""

# 3. 安装根依赖（完全隔离）
echo "3️⃣  安装根依赖（只在项目内）..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏳ 这可能需要几分钟..."

npm install --no-optional --legacy-peer-deps 2>&1 | tee logs/root-install.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ 根依赖安装完成"
else
    echo "❌ 根依赖安装失败，请查看 logs/root-install.log"
    exit 1
fi

echo ""

# 4. 安装编辑器依赖（完全隔离）
echo "4️⃣  安装编辑器依赖（只在 packages/scratch-gui 内）..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd packages/scratch-gui

# 编辑器也使用本地配置
cat > .npmrc << 'EOF'
prefix=${PWD}/node_modules/.global
EOF

echo "⏳ 这可能需要 5-10 分钟..."
npm install --no-optional --legacy-peer-deps 2>&1 | tee ../../logs/gui-install.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ 编辑器依赖安装完成"
else
    echo "❌ 编辑器依赖安装失败，请查看 logs/gui-install.log"
    exit 1
fi

echo ""

# 5. 验证安装
echo "5️⃣  验证安装（检查隔离）..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$SCRIPT_DIR"

# 检查 node_modules 是否在项目内
ROOT_NODE_MODULES="$SCRIPT_DIR/node_modules"
GUI_NODE_MODULES="$SCRIPT_DIR/packages/scratch-gui/node_modules"

if [ -d "$ROOT_NODE_MODULES" ]; then
    ROOT_SIZE=$(du -sh "$ROOT_NODE_MODULES" 2>/dev/null | cut -f1)
    echo "✅ 根 node_modules: $ROOT_NODE_MODULES ($ROOT_SIZE)"
else
    echo "⚠️  根 node_modules 不存在"
fi

if [ -d "$GUI_NODE_MODULES" ]; then
    GUI_SIZE=$(du -sh "$GUI_NODE_MODULES" 2>/dev/null | cut -f1)
    echo "✅ 编辑器 node_modules: $GUI_NODE_MODULES ($GUI_SIZE)"
else
    echo "⚠️  编辑器 node_modules 不存在"
fi

# 检查是否误装到全局
GLOBAL_SCRATCH=$(npm list -g --depth=0 2>/dev/null | grep -i scratch || echo "")
if echo "$GLOBAL_SCRATCH" | grep -q "scratch"; then
    echo "⚠️  警告：发现全局 scratch 包（虽然不应该有）"
else
    echo "✅ 全局 npm 无 scratch 相关包"
fi

echo ""

# 6. 创建启动脚本
echo "6️⃣  创建隔离启动脚本..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat > start-editor.sh << 'EOF'
#!/bin/bash
# Scratch Editor 隔离启动脚本

cd "$(dirname "$0")/packages/scratch-gui"

# 使用项目本地的 npm
# 确保端口是 8601（不与其他项目冲突）
PORT=${PORT:-8601}

echo "🔒 启动 Scratch Editor（完全隔离模式）"
echo "端口: $PORT"
echo "访问: http://localhost:$PORT"
echo ""

npm start
EOF
chmod +x start-editor.sh
echo "✅ 启动脚本已创建: ./start-editor.sh"

echo ""

# 完成
echo "════════════════════════════════════════"
echo "✅ 安装完成！"
echo "════════════════════════════════════════"
echo ""
echo "📦 依赖位置："
echo "   - 根依赖: $SCRIPT_DIR/node_modules/"
echo "   - 编辑器依赖: $SCRIPT_DIR/packages/scratch-gui/node_modules/"
echo ""
echo "🚀 启动编辑器："
echo "   cd $SCRIPT_DIR"
echo "   ./start-editor.sh"
echo ""
echo "🔍 验证隔离："
echo "   bash $SCRIPT_DIR/../documents/验证隔离.sh"
echo ""

