# 生产环境测试设置

## 📋 配置简化

为了快速验证定时任务框架，我们简化了配置：

### 原始配置 (5 个任务)

- python-task-1 (每 5 分钟)
- python-task-2 (每 10 分钟)
- nodejs-task-1 (每 3 分钟)
- nodejs-task-2 (每 7 分钟)
- daily-summary (每日 18:00)

### 简化配置 (1 个任务)

- test-task (每 2 分钟)

## 🎯 测试目标

验证以下核心功能：

1. ✅ **SST 部署**: 基础设施创建
2. ✅ **Lambda 执行**: 函数正常工作
3. ✅ **定时触发**: EventBridge 规则工作
4. ✅ **数据存储**: DynamoDB 写入正常
5. ✅ **日志记录**: CloudWatch 日志完整

## 🚀 快速部署

### 方法 1: 使用部署脚本 (推荐)

```bash
# 运行部署脚本
./scripts/deploy-prod.sh
```

### 方法 2: 手动部署

```bash
# 验证配置
node tools/task-manager.js validate

# 部署到生产环境
bun sst deploy --stage prod

# 查看部署状态
bun sst list --stage prod
```

## 🔍 验证部署

### 方法 1: 使用验证脚本

```bash
# 运行验证脚本
./scripts/verify-deployment.sh
```

### 方法 2: 手动验证

```bash
# 1. 手动触发测试
bun sst invoke --stage prod python_crawlerFunction --event '{"taskName":"test_task","taskType":"simple_task_1"}'

# 2. 查看函数日志
bun sst logs --stage prod --function python_crawlerFunction --follow

# 3. 检查 DynamoDB 数据
aws dynamodb scan \
  --table-name kairos-be-prod-MarketData \
  --filter-expression "begins_with(pk, :pk)" \
  --expression-attribute-values '{":pk":{"S":"task#"}}' \
  --limit 5
```

## 📊 预期结果

### AWS 资源

部署完成后应该看到：

- **DynamoDB 表**: `kairos-be-prod-MarketData`
- **Lambda 函数**: `kairos-be-prod-python_crawlerFunction`
- **EventBridge 规则**: `kairos-be-prod-test-taskCron`

### 数据记录

DynamoDB 中应该有类似记录：

```json
{
  "pk": "task#test_task",
  "sk": "2025-01-XXTXX:XX:XX.XXXZ",
  "data": "{\"task_name\":\"simple_task_1\",\"timestamp\":\"2025-01-XXTXX:XX:XX.XXXZ\",\"status\":\"completed\",\"message\":\"Task 1 executed successfully\"}",
  "source": "python_crawler",
  "updated_at": "2025-01-XXTXX:XX:XX.XXXZ"
}
```

### 日志输出

CloudWatch 日志中应该有：

```
INFO: Received event: {"taskName":"test_task","taskType":"simple_task_1",...}
INFO: Executing task: test_task (type: simple_task_1)
INFO: Task 1 executed at: 2025-01-XXTXX:XX:XX.XXXZ
INFO: Saved task result for test_task to DynamoDB
```

## ⏱️ 时间安排

- **部署时间**: 约 2-3 分钟
- **验证时间**: 约 5-10 分钟
- **总测试时间**: 约 10-15 分钟

## 🔄 测试完成后

验证成功后，你可以：

1. **扩展配置**: 恢复完整的任务配置
2. **调整频率**: 修改执行频率
3. **增加资源**: 调整内存和超时时间
4. **实现真实逻辑**: 添加数据爬取功能

## 📁 相关文件

- **配置文件**: `config/scheduled-tasks.json`
- **部署脚本**: `scripts/deploy-prod.sh`
- **验证脚本**: `scripts/verify-deployment.sh`
- **详细指南**: `docs/development/quick-deployment-test.md`

## 🛠️ 故障排除

如果遇到问题：

1. **检查 AWS 权限**: `aws sts get-caller-identity`
2. **验证配置**: `node tools/task-manager.js validate`
3. **查看错误日志**: `bun sst logs --stage prod --function python_crawlerFunction --error`
4. **检查 EventBridge**: `aws events list-rules --name-prefix kairos-be-prod`

---

**测试目标**: 生产环境验证
**配置状态**: 简化配置 (1 个任务)
**维护者**: 开发团队
