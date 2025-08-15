# AI Agent 实现说明

## 概述

我们实现了一个简化的 AI agent 系统，使用 Gemini 2.5 Flash 来生成市场分析报告。系统设计简洁，专注于核心功能，避免过度工程化。

## 架构组件

### 1. AI Agent (`src/reporting/application/ai_agent.ts`)

- **核心类**：`AiAgent` 负责与 Gemini API 交互
- **工具管理**：支持注册和执行各种工具
- **报告生成**：使用 AI 生成结构化的市场分析报告

### 2. 工具系统 (`src/reporting/application/tools/`)

- **MarketDataTool**：提供市场数据和分析
- **NewsTool**：提供新闻分析和情感评估
- **可扩展性**：易于添加新的工具

### 3. 报告生成 (`src/reporting/application/generate_overall_report.ts`)

- **工作流**：初始化 AI agent → 注册工具 → 生成报告 → 保存到数据库
- **集成**：与现有的 DynamoDB 存储系统集成

## 核心功能

### AI Agent 工作流程

1. **初始化**：创建 Gemini 客户端
2. **工具注册**：注册可用的分析工具
3. **Prompt 构建**：结合系统 prompt 和工具描述
4. **AI 生成**：使用 Gemini 生成分析报告
5. **结果处理**：解析 AI 输出并创建结构化报告

### 工具系统

- **工具接口**：统一的 `AiAgentTool` 接口
- **工具注册**：动态注册和管理工具
- **工具执行**：AI 可以调用工具获取数据

## 配置要求

### 环境变量

- `GEMINI_API_KEY`：Google Gemini API 密钥

### 部署配置

- Lambda 函数已配置访问 Gemini API
- 定时任务每天 01:00 UTC 生成报告

## 使用方法

### 基本使用

```typescript
import { createAiAgent } from "./ai_agent";
import { createMarketDataTool, createNewsTool } from "./tools";

const aiAgent = createAiAgent(geminiApiKey);
aiAgent.registerTool(createMarketDataTool());
aiAgent.registerTool(createNewsTool());

const report = await aiAgent.generateOverallReport({
  asOfDate: "2025-01-01",
  marketScope: "CN",
  systemPrompt: "分析中国股市...",
});
```

### 添加新工具

```typescript
export class NewTool implements AiAgentTool {
  name = "new_tool";
  description = "Tool description";

  async execute(params: Record<string, unknown>): Promise<unknown> {
    // Tool implementation
    return { result: "data" };
  }
}

aiAgent.registerTool(new NewTool());
```

## 技术特点

### 1. 简洁性

- 移除了复杂的抽象层
- 直接使用 Gemini API
- 简单的工具注册机制

### 2. 可扩展性

- 易于添加新工具
- 支持自定义 prompt
- 灵活的参数配置

### 3. 集成性

- 与现有 DynamoDB 系统集成
- 支持 Lambda 部署
- 完整的测试覆盖

## 测试验证

### 测试覆盖

- ✅ AI agent 功能测试
- ✅ 工具注册和执行测试
- ✅ 报告生成流程测试
- ✅ 数据库存储测试

### 运行测试

```bash
npm test
```

## 部署说明

### 本地测试

1. 设置 `GEMINI_API_KEY` 环境变量
2. 运行 `npm test` 验证功能
3. 使用 `npx tsc --noEmit` 检查类型

### 生产部署

1. 确保 `GEMINI_API_KEY` 在部署环境中可用
2. 部署 Lambda 函数和定时任务
3. 监控日志和错误

## 后续优化

### 短期优化

1. 根据实际使用情况调整 prompt
2. 优化工具的数据质量
3. 添加错误处理和重试机制

### 长期规划

1. 集成实时市场数据
2. 添加更多专业分析工具
3. 实现报告质量评估

## 总结

这个简化的 AI agent 实现提供了：

- **核心功能**：AI 驱动的报告生成
- **工具集成**：可扩展的工具系统
- **简洁架构**：避免过度工程化
- **生产就绪**：完整的测试和部署配置

系统专注于核心价值，为后续的功能扩展奠定了坚实的基础。
