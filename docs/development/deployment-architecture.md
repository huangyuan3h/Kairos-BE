# 部署架构设计

> 🏗️ 本文档描述了 Kairos-BE 项目的模块化部署架构，基于 SST (Serverless Stack) 实现。

## 架构概述

Kairos-BE 采用模块化的部署架构，将基础设施资源按功能分类管理，提高代码的可维护性和可扩展性。

### 核心设计原则

1. **模块化设计**: 每个模块专注于特定类型的资源
2. **依赖管理**: 正确的资源创建顺序处理依赖关系
3. **可扩展性**: 易于添加新的资源和功能
4. **类型安全**: 完整的 TypeScript 类型支持

## 目录结构

```
deploy/
├── shared/           # 共享资源 (Linkables 等)
├── database/         # 数据库资源 (DynamoDB 等)
├── api/             # API 资源 (REST, GraphQL)
├── cron/            # 定时任务和后台作业
├── auth/            # 认证资源 (Cognito)
├── types.ts         # TypeScript 类型定义
└── index.ts         # 主编排文件
```

## 模块说明

### 1. 共享资源 (shared/)

**文件**: `deploy/shared/linkables.ts`

管理可在多个服务间共享的配置资源，如 Linkable 配置值。

```typescript
export function createLinkables(): LinkableResources {
  const linkableValue = new sst.Linkable("MyLinkableValue", {
    properties: {
      foo: "Hello World",
    },
  });

  return { linkableValue };
}
```

### 2. 数据库资源 (database/)

**文件**: `deploy/database/dynamodb.ts`

管理所有数据库相关的配置，包括 DynamoDB 表结构。

```typescript
export function createDatabase(): DatabaseResources {
  const marketDataTable = new sst.aws.Dynamo("MarketData", {
    fields: {
      pk: "string",
      sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  });

  return { marketDataTable };
}
```

### 3. API 资源 (api/)

**文件**:

- `deploy/api/rest.ts` - REST API 配置
- `deploy/api/graphql.ts` - GraphQL API 配置

管理 API Gateway 和端点配置。

```typescript
export function createRestApi(linkables: LinkableResources): RestApiResources {
  const api = new sst.aws.ApiGatewayV2("MainApi", {
    routes: {
      "GET /": {
        function: {
          handler: "functions/src/functions/api.handler",
          runtime: "python3.11",
          link: [linkables.linkableValue],
        },
      },
    },
  });

  return { api };
}
```

### 4. 定时任务 (cron/)

**文件**: `deploy/cron/tasks.ts`

管理所有定时任务和后台作业配置。

```typescript
export function createCronJobs(linkables: LinkableResources): CronJobResources {
  const testTaskCron = new sst.aws.Cron("TestTaskCron", {
    schedule: "rate(2 minutes)",
    function: {
      handler: "functions/src/functions/api.handler",
      runtime: "python3.11",
      link: [linkables.linkableValue],
      url: true,
    },
  });

  return { testTaskCron };
}
```

### 5. 认证资源 (auth/)

**文件**: `deploy/auth/cognito.ts`

管理 Cognito 用户池和身份池配置。

```typescript
export function createAuth(): AuthResources {
  // 用户池配置
  const userPool = new sst.aws.Cognito("UserPool", {
    login: ["email"],
  });

  // 身份池配置
  const identityPool = new sst.aws.CognitoIdentityPool("IdentityPool", {
    allowUnauthenticatedIdentities: false,
    allowClassicFlow: false,
  });

  return { userPool, identityPool };
}
```

## 依赖管理

资源按照以下顺序创建，确保依赖关系正确处理：

1. **共享资源** (Linkables) - 基础配置
2. **数据库资源** (DynamoDB) - 数据存储
3. **认证资源** (Cognito) - 用户认证
4. **API 资源** (API Gateway) - 可能依赖认证
5. **定时任务** (Cron) - 可能依赖 API 和数据库

## 类型安全

项目使用完整的 TypeScript 类型定义确保类型安全：

```typescript
// deploy/types.ts
export interface InfrastructureResources {
  linkables: LinkableResources;
  database: DatabaseResources;
  auth: AuthResources;
  restApi: RestApiResources;
  graphqlApi: GraphQLApiResources;
  cronJobs: CronJobResources;
}
```

## 环境配置

支持不同环境的条件部署：

```typescript
// 示例：仅在生产环境创建某些资源
if (process.env.SST_STAGE === "prod") {
  // 生产环境特定资源
}
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

## 扩展指南

### 添加新资源

1. **数据库表**: 编辑 `deploy/database/dynamodb.ts`
2. **API 端点**: 编辑 `deploy/api/rest.ts` 或 `deploy/api/graphql.ts`
3. **定时任务**: 编辑 `deploy/cron/tasks.ts`
4. **认证服务**: 编辑 `deploy/auth/cognito.ts`
5. **共享配置**: 编辑 `deploy/shared/linkables.ts`

### 示例：添加新定时任务

```typescript
// 在 deploy/cron/tasks.ts 中
export function createCronJobs(linkables: LinkableResources): CronJobResources {
  // 现有定时任务...

  // 新的数据同步任务
  const dataSyncCron = new sst.aws.Cron("DataSyncCron", {
    schedule: "rate(1 hour)",
    function: {
      handler: "functions/src/functions/data_sync.handler",
      runtime: "python3.11",
      link: [linkables.linkableValue],
      timeout: "5 minutes",
    },
  });

  return {
    testTaskCron,
    dataSyncCron,
  };
}
```

## 优势

1. **可维护性**: 清晰的关注点分离
2. **可扩展性**: 易于添加新资源
3. **可重用性**: 共享资源可在服务间使用
4. **可测试性**: 每个模块可独立测试
5. **文档化**: 自文档化的结构

---

**相关文档**:

- [部署指南](./deployment-guide.md) - 详细的部署操作指南
- [环境配置](./environment-setup.md) - 开发环境配置
- [基础设施架构](./infrastructure.md) - AWS 基础设施设计
