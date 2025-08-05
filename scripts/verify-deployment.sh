#!/bin/bash

# 部署验证脚本
# 用于验证定时任务框架是否正常工作

set -e

echo "🔍 开始验证部署..."

# 检查是否在正确的目录
if [ ! -f "sst.config.ts" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查 AWS 凭证
echo "🔍 检查 AWS 凭证..."
aws sts get-caller-identity

# 显示部署状态
echo "📊 当前部署状态:"
sst list --stage prod

echo ""
echo "🧪 开始验证测试..."

# 1. 手动触发测试
echo "1️⃣ 手动触发 Lambda 函数测试..."
sst invoke --stage prod python_crawlerFunction --event '{"taskName":"test_task","taskType":"simple_task_1"}'

echo ""
echo "2️⃣ 等待 30 秒让定时任务执行..."
sleep 30

# 2. 检查 DynamoDB 数据
echo "3️⃣ 检查 DynamoDB 数据..."
aws dynamodb scan \
  --table-name kairos-be-prod-MarketData \
  --filter-expression "begins_with(pk, :pk)" \
  --expression-attribute-values '{":pk":{"S":"task#"}}' \
  --limit 5

echo ""
echo "4️⃣ 查看最近的函数日志..."
sst logs --stage prod --function python_crawlerFunction --start-time 5m

echo ""
echo "✅ 验证完成!"
echo ""
echo "📋 验证结果说明:"
echo "- 如果手动触发成功，说明 Lambda 函数工作正常"
echo "- 如果 DynamoDB 中有数据，说明数据存储正常"
echo "- 如果日志中有定时执行记录，说明 EventBridge 工作正常"
echo ""
echo "🎯 成功指标:"
echo "✅ Lambda 函数可执行"
echo "✅ 数据存储到 DynamoDB"
echo "✅ 定时任务自动执行"
echo "✅ 日志记录完整" 