# Kairos-BE

Backend service for Kairos V2, a comprehensive investment analysis system built with SST framework.

> **📖 项目文档**: 详细的项目背景、业务场景和技术架构请查看 [文档中心](./docs/README.md)

## 项目概述

Kairos V2 是一个投资分析系统，专注于从上到下的资产投资价值分析。系统通过多维度分析，识别具有投资潜力的资产类别和具体标的。

**核心特性**:

- 🚀 纯 Serverless 架构 (SST 框架)
- 🔄 多语言支持 (Node.js, Golang, Python)
- 📊 实时数据处理和分析
- 🤖 AI 驱动的投资建议
- 🔐 完整的认证授权体系

## Prerequisites

Before you begin, ensure you have the following installed:

- **Python:** Version 3.11.x ([Download Python](https://www.python.org/downloads/))
- **Node.js:** Version 22.x (LTS) or higher ([Download Node.js](https://nodejs.org/) or use a version manager like [nvm](https://github.com/nvm-sh/nvm))
- **uv:** A fast Python package installer and resolver. ([Installation Guide](https://docs.astral.sh/uv/getting-started/installation/))
- **Bun:** A fast JavaScript runtime, bundler, test runner, and package manager. ([Installation Guide](https://bun.sh/docs/installation))

## Setup Instructions

1.  **Clone the repository:**

    ```bash
    git clone <your-repository-url>
    cd Kairos-BE
    ```

2.  **Set up Python Virtual Environment:**

    - Create the virtual environment using `uv` and Python 3.11:

    ```bash
    uv venv -p 3.11 .venv
    ```

    - Activate the virtual environment:

    ```bash
    # On macOS/Linux
    source .venv/bin/activate
    # On Windows (Git Bash)
    # source .venv/Scripts/activate
    # On Windows (Command Prompt)
    # .venv\Scripts\activate.bat
    # On Windows (PowerShell)
    # .venv\Scripts\Activate.ps1
    ```

    You should see `(.venv)` prepended to your shell prompt.

3.  **Set up Node.js Environment and Install Dependencies:**

    - This project uses `bun` to manage Node.js dependencies (like SST).
    - Install dependencies defined in `package.json`:

    ```bash
    bun install
    ```

    This will create a `bun.lockb` file locking the dependency versions.

4.  **Install Python Dependencies (Workspace Setup):**
    - This project uses `uv` workspaces (`functions` and `core`). Dependencies are defined in `functions/pyproject.toml` and `core/pyproject.toml`.
    - **(You need to create these `pyproject.toml` files first!)**
    - Once the workspace `pyproject.toml` files are defined, install all workspace dependencies (ensure the Python virtual environment `.venv` is active):
    ```bash
    # (Run from the project root directory)
    uv pip sync
    ```

## 快速导航

- 📚 [文档中心](./docs/README.md) - 完整的项目文档体系
- 📋 [项目背景](./docs/PROJECT_CONTEXT.md) - 详细的业务场景和技术架构
- ✅ [任务清单](./docs/TODO.md) - 开发任务拆分和进度跟踪
- 🚀 [部署指南](#deployment) - 环境配置和部署流程

## Project Structure

```
Kairos-BE/
├── 📁 functions/          # Lambda函数 (Python/Golang/Node.js)
├── 📁 core/              # 共享业务逻辑
├── 📁 stacks/            # SST基础设施定义
├── 📁 docs/              # 📚 项目文档中心
│   ├── 📁 overview/      # 项目概述文档
│   ├── 📁 architecture/  # 技术架构文档
│   ├── 📁 business/      # 业务模块文档
│   ├── 📁 development/   # 开发指南文档
│   ├── 📁 data/          # 数据模型文档
│   └── 📁 ai/            # AI集成文档
├── 📁 tests/             # 测试文件
├── 📁 tools/             # 开发工具
├── 📄 PROJECT_CONTEXT.md # 项目背景和技术架构文档
├── 📄 sst.config.ts      # SST配置 (AWS基础设施)
├── 📄 package.json       # Node.js依赖配置
├── 📄 pyproject.toml     # Python项目配置
└── 📄 README.md          # 项目说明文档
```

**关键文件说明**:

- `docs/README.md`: 📚 完整的项目文档体系，专为 AI Agent 和开发者设计
- `docs/PROJECT_CONTEXT.md`: 项目背景、业务场景、技术架构和开发指南
- `docs/TODO.md`: ✅ 开发任务拆分和进度跟踪
- `sst.config.ts`: SST 框架配置，定义 AWS 基础设施
- `package.json`: Node.js 依赖管理 (使用 bun)
- `pyproject.toml`: Python 项目配置 (使用 uv workspace)

## Development

1.  **Activate Python environment:** `source .venv/bin/activate`
2.  **Start SST Live Development:**
    ```bash
    bun sst dev
    ```
    This command starts a local development environment that proxies requests to your Lambda functions running locally, enabling fast feedback loops. Ensure you have configured AWS credentials locally.

## Deployment

- Deploy your application to the configured AWS region (`us-east-1` by default in `sst.config.ts`):
  ```bash
  bun sst deploy
  ```
- To deploy to a specific stage (e.g., production):
  ```bash
  bun sst deploy --stage prod
  ```

## Next Steps

根据 [项目背景文档](./PROJECT_CONTEXT.md#下一步计划)，建议按以下顺序进行开发：

1. **基础设施搭建**

   - 完善 SST 配置 (`sst.config.ts`)
   - 设置 AWS 资源 (DynamoDB, Lambda, API Gateway 等)
   - 配置多语言 Lambda 函数环境

2. **核心模块开发**

   - 创建 `functions/` 和 `core/` 目录结构
   - 实现 Python 数据爬取模块 (akshare)
   - 设计数据模型和存储方案

3. **API 设计**

   - 实现 REST API (Node.js/Golang)
   - 设计 GraphQL Schema
   - 配置 GraphQL Federation

4. **认证系统**

   - 实现用户认证和授权
   - 配置跨语言服务的统一认证机制

5. **AI 集成**

   - 集成 Vercel AI SDK
   - 配置 Langfuse 进行 Prompt 管理
   - 实现实时 Stream 通信

6. **测试和部署**
   - 编写单元测试和集成测试
   - 配置 CI/CD 流程
   - 完善监控和日志系统
