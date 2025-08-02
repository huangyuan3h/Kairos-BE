# 定时任务框架部署指南

## 🎯 目标

验证基于 SST 的定时任务框架是否正常工作，使用简单的任务逻辑来证明架构的可行性。

## 📋 当前架构

### 核心组件

- **配置文件**: `config/scheduled-tasks.json` - 集中管理所有任务
- **Lambda 函数**: Python 和 Node.js 两种运行时
- **DynamoDB**: 存储任务执行结果
- **EventBridge**: 定时触发任务
- **管理工具**: `tools/task-manager.js` - 任务管理

### 简单任务类型

- **simple_task_1**: 记录当前时间戳
- **simple_task_2**: 回显事件数据

## 🚀 快速部署

### 1. 环境准备

```bash
# 确保在项目根目录
cd Kairos-BE

# 激活 Python 环境
source .venv/bin/activate

# 安装依赖
uv pip sync
bun install
```

### 2. 验证配置

```bash
# 查看任务配置
node tools/task-manager.js list

# 验证配置
node tools/task-manager.js validate
```

### 3. 本地测试

```bash
# 测试 Python 任务框架
cd functions
python test_crawler.py
```

### 4. 部署到 AWS

```bash
# 部署到开发环境
bun sst deploy --stage dev

# 查看部署状态
bun sst list
```

### 5. 验证部署

```bash
# 查看函数日志
bun sst logs --function python_crawlerFunction --follow

# 手动触发测试
bun sst invoke python_crawlerFunction --event '{"taskName":"test","taskType":"simple_task_1"}'
```

## 📊 任务配置说明

### 配置文件结构

```json
{
  "tasks": [
    {
      "name": "python-task-1",
      "description": "Python simple task 1 - log timestamp",
      "function": "python_crawler",
      "runtime": "python3.11",
      "schedule": "rate(5 minutes)",
      "enabled": true,
      "config": {
        "taskName": "python_simple_task_1",
        "taskType": "simple_task_1",
        "timeout": 300,
        "memory": 512
      }
    }
  ],
  "global": {
    "tableName": "MarketData",
    "region": "us-east-1"
  }
}
```

### 任务管理

```bash
# 查看所有任务
node tools/task-manager.js list

# 查看特定任务详情
node tools/task-manager.js show python-task-1

# 启用/禁用任务
node tools/task-manager.js enable daily-summary
node tools/task-manager.js disable nodejs-task-2
```

## 🔍 验证步骤

### 1. 检查 DynamoDB 数据

```bash
# 使用 AWS CLI 查看任务结果
aws dynamodb scan \
  --table-name kairos-be-dev-MarketData \
  --filter-expression "begins_with(pk, :pk)" \
  --expression-attribute-values '{":pk":{"S":"task#"}}' \
  --limit 10
```

### 2. 检查 CloudWatch 日志

```bash
# 查看实时日志
bun sst logs --follow

# 查看特定函数日志
bun sst logs --function python_crawlerFunction --start-time 1h
```

### 3. 验证定时执行

等待几分钟后检查：

- DynamoDB 中是否有新的任务记录
- CloudWatch 日志中是否有定时执行记录
- 任务执行时间是否符合配置的调度

## 🛠️ 故障排除

### 常见问题

1. **任务未执行**

   ```bash
   # 检查任务是否启用
   node tools/task-manager.js list

   # 检查 EventBridge 规则
   aws events list-rules --name-prefix kairos-be-dev
   ```

2. **函数执行失败**

   ```bash
   # 查看错误日志
   bun sst logs --function python_crawlerFunction --error

   # 手动测试函数
   bun sst invoke python_crawlerFunction --event '{"taskName":"test","taskType":"simple_task_1"}'
   ```

3. **DynamoDB 权限问题**
   ```bash
   # 检查 IAM 角色权限
   aws iam get-role --role-name kairos-be-dev-python_crawlerFunction-role
   ```

### 调试技巧

1. **本地开发模式**

   ```bash
   # 本地运行 SST
   bun sst dev
   ```

2. **增加日志输出**

   - 在 Lambda 函数中添加更多 `console.log` 或 `logger.info`
   - 重新部署后查看日志

3. **检查配置**
   ```bash
   # 验证配置文件
   node tools/task-manager.js validate
   ```

## 📈 成功指标

部署成功后，你应该看到：

1. ✅ **SST 部署成功**: 所有资源创建完成
2. ✅ **任务配置正确**: 配置文件验证通过
3. ✅ **函数可执行**: 手动触发测试成功
4. ✅ **定时任务运行**: 自动执行并记录结果
5. ✅ **数据存储正常**: DynamoDB 中有任务记录
6. ✅ **日志完整**: CloudWatch 中有执行日志

## 🔄 下一步

框架验证成功后，可以：

1. **添加真实任务**: 实现数据爬取逻辑
2. **优化配置**: 调整执行频率和资源分配
3. **添加监控**: 设置 CloudWatch 告警
4. **扩展功能**: 添加更多任务类型

## 📞 支持

如果遇到问题：

1. 检查 [SST 文档](https://docs.sst.dev/)
2. 查看 AWS CloudWatch 日志
3. 使用任务管理工具验证配置
4. 提交 Issue 到项目仓库

---

**最后更新**: 2025 年 1 月
**维护者**: 开发团队
