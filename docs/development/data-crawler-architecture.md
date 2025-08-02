# 数据爬取架构设计

## 概述

Kairos V2 的数据爬取系统采用 Serverless 架构，通过 SST 框架管理 AWS 资源，实现定时、可扩展的数据采集。

## 架构组件

### 1. 基础设施 (AWS)

- **DynamoDB**: 存储市场数据
- **Lambda**: 执行数据爬取任务
- **EventBridge**: 定时触发任务
- **CloudWatch**: 监控和日志

### 2. 数据源

- **股票数据**: akshare (Python)
- **基金数据**: akshare (Python)
- **加密货币**: CoinGecko API (Node.js)
- **市场指数**: akshare (Python)

### 3. 定时任务

| 任务类型 | 频率       | 语言    | 数据源    |
| -------- | ---------- | ------- | --------- |
| 股票数据 | 每 5 分钟  | Python  | akshare   |
| 加密货币 | 每 1 分钟  | Node.js | CoinGecko |
| 市场总结 | 每日 18:00 | Python  | akshare   |

## 数据模型

### DynamoDB 表结构

```json
{
  "pk": "string", // 分区键: data_type#symbol
  "sk": "string", // 排序键: timestamp
  "data": "string", // JSON 数据
  "source": "string", // 数据源
  "updated_at": "string", // 更新时间
  "ttl": "number" // 过期时间
}
```

### 数据示例

#### 股票数据

```json
{
  "pk": "stock#000001",
  "sk": "2024-01-15T10:30:00Z",
  "data": {
    "symbol": "000001",
    "name": "平安银行",
    "price": 12.34,
    "change": 2.5,
    "volume": 1234567,
    "turnover": 15234567.89,
    "market_cap": 1234567890,
    "pe_ratio": 15.6,
    "pb_ratio": 1.2,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "source": "akshare",
  "updated_at": "2024-01-15T10:30:00Z",
  "ttl": 1705327800
}
```

#### 加密货币数据

```json
{
  "pk": "crypto#BTC",
  "sk": "2024-01-15T10:30:00Z",
  "data": {
    "symbol": "BTC",
    "name": "Bitcoin",
    "price": 43250.5,
    "change_24h": 2.3,
    "market_cap": 850000000000,
    "volume_24h": 25000000000,
    "market_cap_rank": 1,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "source": "coingecko",
  "updated_at": "2024-01-15T10:30:00Z",
  "ttl": 1705327800
}
```

## 部署流程

### 1. 环境准备

```bash
# 激活 Python 虚拟环境
source .venv/bin/activate

# 安装依赖
uv pip sync

# 安装 Node.js 依赖
bun install
```

### 2. 本地测试

```bash
# 测试 Python 爬虫
cd functions
python test_crawler.py
```

### 3. 部署到 AWS

```bash
# 部署到开发环境
bun sst deploy --stage dev

# 部署到生产环境
bun sst deploy --stage prod
```

### 4. 验证部署

```bash
# 查看部署状态
bun sst list

# 查看函数日志
bun sst logs --function PythonDataCrawler
```

## 监控和运维

### 1. CloudWatch 监控

- **函数执行时间**: 监控 Lambda 执行性能
- **错误率**: 监控数据爬取成功率
- **内存使用**: 监控资源使用情况

### 2. 日志分析

```bash
# 查看实时日志
bun sst logs --follow

# 查看特定函数的日志
bun sst logs --function PythonDataCrawler --follow
```

### 3. 数据质量检查

- **数据完整性**: 检查必要字段是否存在
- **数据时效性**: 检查数据更新时间
- **数据准确性**: 检查数值范围合理性

## 扩展性设计

### 1. 新增数据源

1. 在 `sst.config.ts` 中添加新的 Cron 任务
2. 创建对应的 Lambda 函数
3. 实现数据获取和存储逻辑
4. 更新数据模型

### 2. 调整频率

```typescript
// 修改定时任务频率
new Cron(stack, "CustomCron", {
  schedule: "rate(1 minute)", // 每分钟
  // schedule: "cron(0 */2 * * ? *)", // 每2小时
  // schedule: "cron(0 0 * * ? *)", // 每天午夜
  job: crawlerFunction,
});
```

### 3. 数据保留策略

```typescript
// 设置 TTL (Time To Live)
const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7天
```

## 故障处理

### 1. 常见问题

- **API 限流**: 实现重试机制和指数退避
- **网络超时**: 增加超时时间和重试次数
- **数据格式变化**: 实现数据验证和容错处理

### 2. 恢复策略

- **自动重试**: Lambda 内置重试机制
- **手动触发**: 通过 AWS Console 手动执行
- **数据修复**: 重新爬取历史数据

## 性能优化

### 1. Lambda 配置

- **内存**: 根据数据处理需求调整 (512MB - 3008MB)
- **超时**: 根据 API 响应时间设置 (1-15 分钟)
- **并发**: 控制并发执行数量

### 2. DynamoDB 优化

- **分区键设计**: 避免热点分区
- **批量写入**: 减少 API 调用次数
- **TTL 设置**: 自动清理过期数据

## 安全考虑

### 1. 访问控制

- **IAM 角色**: 最小权限原则
- **VPC 配置**: 网络隔离
- **加密**: 数据传输和存储加密

### 2. API 安全

- **API Key**: 保护外部 API 访问
- **请求限流**: 避免过度请求
- **错误处理**: 不暴露敏感信息

## 下一步计划

1. **数据验证**: 实现数据质量检查
2. **告警机制**: 设置异常告警
3. **数据备份**: 实现数据备份策略
4. **性能监控**: 添加详细性能指标
5. **成本优化**: 监控和优化 AWS 成本

---

**最后更新**: 2025 年 1 月
**维护者**: 开发团队
