# Kairos V2 文档中心

> 📖 这是 Kairos V2 项目的完整文档中心，专为 AI Agent 和开发者设计，提供结构化的项目信息。

## 🚀 快速开始

- **项目背景**: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - 完整的技术架构和业务场景
- **任务清单**: [TODO.md](./TODO.md) - 开发任务拆分和进度跟踪
- **定时任务框架**: [框架概述](./development/framework-overview.md) - 可配置的定时任务框架
- **框架部署**: [部署指南](./development/framework-deployment.md) - 快速部署和验证
- **业务模块**: [业务模块](./business/modules-overview.md) - 两大核心模块介绍

## 📚 文档分类

### 🎯 项目概述

- [项目背景](./PROJECT_CONTEXT.md) - 完整的技术架构和业务场景
- [任务清单](./TODO.md) - 开发任务拆分和进度跟踪
- [项目介绍](./overview/project-introduction.md) - 项目背景、目标和价值
- [业务场景](./overview/business-scenarios.md) - 核心业务场景和用户故事
- [盈利模式](./overview/business-model.md) - Token 计费和商业模式

### 🏗️ 技术架构

- [技术栈](./architecture/technical-stack.md) - 完整的技术选型和架构设计
- [多语言架构](./architecture/multi-language.md) - Python/Golang/Node.js 分工
- [基础设施](./architecture/infrastructure.md) - AWS 资源和 SST 配置

### 💼 业务模块

- [模块概览](./business/modules-overview.md) - 两大核心模块介绍
- [资产管理](./business/asset-management.md) - 用户资产管理和卖出时机判断
- [机会发现](./business/opportunity-discovery.md) - 市场分析和投资机会识别
- [AI 交互](./business/ai-interaction.md) - AI 驱动的用户交互设计

### 🔧 开发指南

- [定时任务框架概述](./development/framework-overview.md) - 可配置的定时任务框架
- [框架部署指南](./development/framework-deployment.md) - 框架部署和验证
- [快速部署测试](./development/quick-deployment-test.md) - 生产环境快速验证
- [数据爬取架构](./development/data-crawler-architecture.md) - 数据爬取系统架构
- [开发环境](./development/environment-setup.md) - 本地开发环境配置
- [API 设计](./development/api-design.md) - REST 和 GraphQL 接口设计
- [认证授权](./development/authentication.md) - 用户认证和权限管理
- [部署流程](./development/deployment.md) - 环境部署和运维

### 📊 数据模型

- [数据架构](./data/data-architecture.md) - 数据存储和同步策略
- [用户数据](./data/user-data.md) - 用户信息和资产数据模型
- [市场数据](./data/market-data.md) - 市场数据和爬取策略

### 🤖 AI 集成

- [AI 架构](./ai/ai-architecture.md) - AI 服务整体架构
- [Vercel AI SDK](./ai/vercel-ai-sdk.md) - AI 交互实现
- [Langfuse 集成](./ai/langfuse-integration.md) - Prompt 管理和监控
- [Token 计费](./ai/token-billing.md) - AI 使用量统计和计费

## 🔍 文档使用指南

### 对于 AI Agent

1. **理解项目**: 从 [项目概述](./overview/project-introduction.md) 开始
2. **技术实现**: 查看 [技术架构](./architecture/technical-stack.md) 了解实现方案
3. **业务逻辑**: 参考 [业务模块](./business/modules-overview.md) 理解功能需求
4. **开发细节**: 根据具体任务查看相应的开发指南

### 对于开发者

1. **环境搭建**: 按照 [开发环境](./development/environment-setup.md) 配置本地环境
2. **模块开发**: 根据 [业务模块](./business/modules-overview.md) 进行功能开发
3. **API 实现**: 参考 [API 设计](./development/api-design.md) 实现接口
4. **部署上线**: 按照 [部署流程](./development/deployment.md) 进行部署

## 📝 文档维护

- **更新频率**: 重要变更及时更新，定期审查文档准确性
- **版本控制**: 文档变更需要提交到 Git，保持与代码同步
- **团队协作**: 鼓励团队成员贡献和更新文档

---

**最后更新**: 2025 年 1 月
**维护者**: 开发团队
