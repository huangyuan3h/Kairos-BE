# 部署操作指南

> 🚀 本文档提供了 Kairos-BE 项目的详细部署操作指南，包括环境配置、部署流程和故障排除。

## 前置要求

### 1. 系统要求

- **Node.js**: 版本 18 或更高
- **AWS CLI**: 已配置适当的凭证
- **SST CLI**: 全局安装 `npm install -g sst`

### 2. AWS 配置

确保 AWS CLI 已正确配置：

```bash
# 配置 AWS 凭证
aws configure

# 验证配置
aws sts get-caller-identity
```

## 快速开始

### 1. 初始设置

```bash
# 安装项目依赖
npm install

# 检查 SST 配置
npx sst check
```

### 2. 开发环境部署

```bash
# 部署到开发环境
npx sst deploy --stage dev

# 或使用默认阶段
npx sst deploy
```

### 3. 生产环境部署

```bash
# 部署到生产环境
npx sst deploy --stage prod
```

## 环境管理

### 阶段配置

项目支持多个部署阶段：

- **dev**: 开发环境
- **staging**: 预发布环境
- **prod**: 生产环境

### 环境特定资源

某些资源仅在特定环境中创建：

```typescript
// 示例：仅在生产环境创建监控资源
if (process.env.SST_STAGE === "prod") {
  // 生产环境特定资源
}
```

## 资源管理

### 添加新资源

1. **数据库表**: 编辑 `deploy/database/dynamodb.ts`
2. **API 端点**: 编辑 `deploy/api/rest.ts` 或 `deploy/api/graphql.ts`
3. **定时任务**: 编辑 `deploy/cron/tasks.ts`
4. **认证服务**: 编辑 `deploy/auth/cognito.ts`
5. **共享配置**: 编辑 `deploy/shared/linkables.ts`

### 更新现有资源

1. 修改 `deploy/` 目录中的相应文件
2. 运行 `npx sst diff` 预览更改
3. 运行 `npx sst deploy` 应用更改

### 删除资源

1. 从相应文件中删除资源定义
2. 运行 `npx sst diff` 预览更改
3. 运行 `npx sst deploy` 应用更改

## 监控和调试

### 查看部署状态

```bash
# 检查当前部署状态
npx sst state

# 查看部署日志
npx sst logs
```

### 调试模式

```bash
# 启动开发模式（实时重载）
npx sst dev

# 访问已部署的函数
npx sst shell
```

### 资源检查

```bash
# 列出所有已部署的资源
npx sst list

# 获取资源详细信息
npx sst info
```

## 部署流程

### 1. 开发环境部署

```bash
# 1. 检查配置
npx sst check

# 2. 预览更改
npx sst diff

# 3. 部署到开发环境
npx sst deploy --stage dev

# 4. 验证部署
npx sst list
```

### 2. 生产环境部署

```bash
# 1. 确保开发环境测试通过
npx sst deploy --stage dev

# 2. 预览生产环境更改
npx sst diff --stage prod

# 3. 部署到生产环境
npx sst deploy --stage prod

# 4. 验证生产环境
npx sst list --stage prod
```

### 3. 回滚部署

```bash
# 查看部署历史
npx sst state

# 回滚到之前的版本
npx sst deploy --stage prod --previous
```

## 最佳实践

### 1. 资源命名

- 使用描述性的资源名称
- 包含阶段前缀用于生产资源
- 遵循一致的命名约定

### 2. 配置管理

- 将敏感数据存储在 SST secrets 中
- 使用环境变量进行配置
- 避免在部署文件中硬编码值

### 3. 测试验证

- 在开发环境中首先测试更改
- 使用 `npx sst diff` 预览更改
- 在部署前验证配置

### 4. 安全性

- 使用最小权限 IAM 策略
- 为敏感数据启用加密
- 定期轮换访问密钥

## 故障排除

### 常见问题

#### 1. 导入错误

**问题**: SST 配置中的静态导入错误

**解决方案**: 确保在 `sst.config.ts` 中使用动态导入

```typescript
// 正确的方式
async run() {
  const { createInfrastructure } = await import("./deploy");
  // ...
}

// 错误的方式
import { createInfrastructure } from "./deploy";
```

#### 2. 资源冲突

**问题**: 重复的资源名称

**解决方案**: 检查所有模块文件中的资源名称，确保唯一性

#### 3. 权限错误

**问题**: AWS 权限不足

**解决方案**:

- 验证 AWS 凭证
- 检查 IAM 权限
- 确保用户有足够的权限

#### 4. 超时问题

**问题**: 函数执行超时

**解决方案**: 调整函数超时设置

```typescript
function: {
  handler: "functions/src/functions/api.handler",
  runtime: "python3.11",
  timeout: "5 minutes", // 增加超时时间
}
```

### 获取帮助

- 查看 SST 文档: https://sst.dev
- 查看部署日志: `npx sst logs`
- 使用 SST 诊断: `npx sst diagnostic`

## 迁移指南

### 从单体到模块化

如果从单一的 `sst.config.ts` 文件迁移：

1. 创建 `deploy/` 目录结构
2. 将资源定义移动到相应的模块
3. 更新 `sst.config.ts` 使用动态导入
4. 使用 `npx sst diff` 测试部署
5. 逐步部署更改

### 版本更新

更新 SST 版本时：

1. 检查发布说明中的破坏性更改
2. 根据需要更新资源配置
3. 首先在开发环境中测试
4. 验证后部署到生产环境

## 自动化部署

### CI/CD 集成

可以使用 GitHub Actions 或其他 CI/CD 工具自动化部署：

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: "18"
      - run: npm install
      - run: npx sst deploy --stage prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

**相关文档**:

- [部署架构设计](./deployment-architecture.md) - 模块化部署架构
- [环境配置](./environment-setup.md) - 开发环境配置
- [基础设施架构](./infrastructure.md) - AWS 基础设施设计
