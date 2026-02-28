#!/bin/bash

# 同步功能测试脚本

PROJECT_DIR="/Users/chenlening/.openclaw/workspace/tencent-doc-sync"
REPO_DIR="/Users/chenlening/workspace/mylerobot-doc"

echo "========================================="
echo "🧪 同步功能测试"
echo "========================================="
echo ""

# 1. 备份当前状态
echo "📦 备份当前状态..."
cd "$REPO_DIR"
git add -A
git stash push -m "pre-refactor-backup-$(date +%Y%m%d_%H%M%S)" 2>/dev/null || echo "  没有需要备份的变更"

# 2. 运行同步
echo ""
echo "🔄 运行同步..."
cd "$PROJECT_DIR"
node src/smart-sync.js 2>&1 | tee /tmp/sync-test.log

# 3. 检查结果
echo ""
echo "✅ 检查同步结果..."
cd "$REPO_DIR"

# 获取文件变化（排除 README.md 和 .sync-metadata.json）
CHANGES=$(git status --short | grep -v "README.md" | grep -v ".sync-metadata.json" | wc -l | tr -d ' ')

if [ $CHANGES -eq 0 ]; then
    echo "✅ 测试通过：没有不必要的文件变化"
    echo ""
    echo "📊 同步统计："
    tail -20 /tmp/sync-test.log
    
    # 恢复 .sync-metadata.json
    git checkout -- tencent-docs/.sync-metadata.json 2>/dev/null || true
    
    exit 0
else
    echo "⚠️  检测到文件变化（排除 README.md 和 .sync-metadata.json）："
    git status --short | grep -v "README.md" | grep -v ".sync-metadata.json"
    echo ""
    echo "检查变化内容："
    git diff --stat | grep -v "README.md" | grep -v ".sync-metadata.json"
    exit 1
fi
