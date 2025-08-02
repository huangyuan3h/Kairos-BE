#!/bin/bash

# 生产环境部署脚本
# 用于快速部署定时任务框架到生产环境

set -e

echo "🚀 开始部署到生产环境..."

# 检查是否在正确的目录
if [ ! -f "sst.config.ts" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查 AWS 凭证
echo "🔍 检查 AWS 凭证..."
aws sts get-caller-identity

# 验证配置
echo "✅ 验证任务配置..."
node tools/task-manager.js validate

# 显示当前配置
echo "📋 当前任务配置:"
node tools/task-manager.js list

# 确认部署
echo ""
echo "⚠️  即将部署到生产环境 (stage: prod)"
echo "   这将创建以下 AWS 资源:"
echo "   - DynamoDB 表: kairos-be-prod-MarketData"
echo "   - Lambda 函数: kairos-be-prod-python_crawlerFunction"
echo "   - EventBridge 规则: kairos-be-prod-test-taskCron"
echo ""
read -p "确认部署? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 部署已取消"
    exit 1
fi

# 部署到生产环境
echo "🚀 部署到生产环境..."
sst deploy --stage prod

# 显示部署结果
echo "✅ 部署完成!"
echo ""
echo "📊 部署结果:"
sst list --stage prod

echo ""
echo "🔍 验证步骤:"
echo "1. 查看函数日志: sst logs --stage prod --function python_crawlerFunction --follow"
echo "2. 手动触发测试: sst invoke --stage prod python_crawlerFunction --event '{\"taskName\":\"test_task\",\"taskType\":\"simple_task_1\"}'"
echo "3. 检查 DynamoDB 数据: aws dynamodb scan --table-name kairos-be-prod-MarketData --limit 5"
echo ""
echo "📖 详细验证步骤请查看: docs/development/quick-deployment-test.md" 