# 快速部署测试指南

## 🎯 目标

快速部署到生产环境验证定时任务框架是否正常工作。

## 📋 当前配置

### 简化配置

我们使用了一个最小化的配置来快速测试：

```json
{
  "tasks": [
    {
      "name": "test-task",
      "description": "Simple test task to verify framework works",
      "function": "python_crawler",
      "runtime": "python3.11",
      "schedule": "rate(2 minutes)",
      "enabled": true,
      "config": {
        "taskName": "test_task",
        "taskType": "simple_task_1",
        "timeout": 60,
        "memory": 256
      }
    }
  ]
}
```

### 任务详情

- **任务名称**: `test-task`
- **执行频率**: 每 2 分钟
- **函数**: Python Lambda
- **超时**: 60 秒
- **内存**: 256MB
- **任务类型**: `simple_task_1` (记录时间戳)

## 🚀 快速部署

### 1. 验证配置

```bash
# 查看任务配置
node tools/task-manager.js list

# 验证配置
node tools/task-manager.js validate
```

### 2. 部署到生产环境

```bash
# 部署到生产环境
sst deploy --stage prod

# 查看部署状态
sst list --stage prod
```

### 3. 验证部署

```bash
# 查看函数日志
sst logs --stage prod --function python_crawlerFunction --follow

# 手动触发测试
sst invoke --stage prod python_crawlerFunction --event '{"taskName":"test_task","taskType":"simple_task_1"}'
```

## 🔍 验证步骤

### 1. 检查 AWS 资源

部署完成后，你应该看到以下 AWS 资源：

- **DynamoDB 表**: `kairos-be-prod-MarketData`
- **Lambda 函数**: `kairos-be-prod-python_crawlerFunction`
- **EventBridge 规则**: `kairos-be-prod-test-taskCron`

### 2. 检查定时执行

等待 2-3 分钟后检查：

```bash
# 查看 DynamoDB 数据
aws dynamodb scan \
  --table-name kairos-be-prod-MarketData \
  --filter-expression "begins_with(pk, :pk)" \
  --expression-attribute-values '{":pk":{"S":"task#"}}' \
  --limit 5

# 查看 CloudWatch 日志
sst logs --stage prod --function python_crawlerFunction --start-time 10m
```

### 3. 验证数据

你应该在 DynamoDB 中看到类似这样的记录：

```json
{
  "pk": "task#test_task",
  "sk": "2025-01-XXTXX:XX:XX.XXXZ",
  "data": "{\"task_name\":\"simple_task_1\",\"timestamp\":\"2025-01-XXTXX:XX:XX.XXXZ\",\"status\":\"completed\",\"message\":\"Task 1 executed successfully\"}",
  "source": "python_crawler",
  "updated_at": "2025-01-XXTXX:XX:XX.XXXZ"
}
```

## ✅ 成功指标

如果以下条件都满足，说明框架工作正常：

1. ✅ **SST 部署成功**: 所有资源创建完成
2. ✅ **函数可执行**: 手动触发测试成功
3. ✅ **定时任务运行**: 每 2 分钟自动执行
4. ✅ **数据存储正常**: DynamoDB 中有任务记录
5. ✅ **日志完整**: CloudWatch 中有执行日志

## 🛠️ 故障排除

### 常见问题

1. **部署失败**

   ```bash
   # 检查 AWS 权限
   aws sts get-caller-identity

   # 检查 SST 配置
   sst validate --stage prod
   ```

2. **函数执行失败**
   ```bash
   # 查看错误日志
   sst logs --stage prod --function python_crawlerFunction --error
   ```

# 检查环境变量

sst invoke --stage prod python_crawlerFunction --event '{"taskName":"test_task","taskType":"simple_task_1"}'

````

3. **定时任务未执行**
```bash
# 检查 EventBridge 规则
aws events list-rules --name-prefix kairos-be-prod

# 检查任务状态
node tools/task-manager.js list
````

## 🔄 测试完成后

验证成功后，你可以：

1. **扩展配置**: 添加更多任务类型
2. **调整频率**: 修改执行频率
3. **增加资源**: 调整内存和超时时间
4. **实现真实逻辑**: 添加数据爬取功能

## 📞 支持

如果遇到问题：

1. 检查 [框架部署指南](./framework-deployment.md)
2. 查看 AWS CloudWatch 日志
3. 使用任务管理工具验证配置
4. 提交 Issue 到项目仓库

---

**部署目标**: 生产环境验证
**测试时间**: 约 5-10 分钟
**维护者**: 开发团队
