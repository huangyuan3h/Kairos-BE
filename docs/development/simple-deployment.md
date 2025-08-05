# 简化部署指南

## 🚨 问题解决

### 1. SST 配置问题

**问题**: `sst.config.ts` 有顶层导入错误
**解决**: 已修复为动态导入

### 2. SST 命令问题

**问题**: `bun sst` 命令不存在
**解决**: 使用 `sst` 命令

## 🚀 快速部署

### 步骤 1: 验证配置

```bash
# 验证任务配置
node tools/task-manager.js validate

# 查看当前配置
node tools/task-manager.js list
```

### 步骤 2: 部署到生产环境

```bash
# 部署到生产环境
sst deploy --stage prod
```

### 步骤 3: 验证部署

```bash
# 查看部署状态
sst list --stage prod

# 手动触发测试
sst invoke --stage prod python_crawlerFunction --event '{"taskName":"test_task","taskType":"simple_task_1"}'

# 查看函数日志
sst logs --stage prod --function python_crawlerFunction --follow
```

## 🔍 验证步骤

### 1. 检查 AWS 资源

部署完成后应该看到：

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

## ✅ 成功指标

如果以下条件都满足，说明框架工作正常：

1. ✅ **SST 部署成功**: 所有资源创建完成
2. ✅ **函数可执行**: 手动触发测试成功
3. ✅ **定时任务运行**: 每 2 分钟自动执行
4. ✅ **数据存储正常**: DynamoDB 中有任务记录
5. ✅ **日志完整**: CloudWatch 中有执行日志

## 🛠️ 故障排除

### 常见问题

1. **SST 命令不存在**

   ```bash
   # 安装 SST CLI
   npm install -g sst
   ```

2. **AWS 权限不足**

   ```bash
   # 检查 AWS 凭证
   aws sts get-caller-identity
   ```

3. **部署失败**

   ```bash
   # 检查 SST 配置
   sst validate --stage prod
   ```

4. **函数执行失败**
   ```bash
   # 查看错误日志
   sst logs --stage prod --function python_crawlerFunction --error
   ```

## 📋 当前配置

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

## 🎯 测试目标

验证以下核心功能：

1. ✅ **SST 部署**: 基础设施创建
2. ✅ **Lambda 执行**: 函数正常工作
3. ✅ **定时触发**: EventBridge 规则工作
4. ✅ **数据存储**: DynamoDB 写入正常
5. ✅ **日志记录**: CloudWatch 日志完整

---

**状态**: 配置已修复，准备部署
**测试时间**: 约 10-15 分钟
**维护者**: 开发团队
