# AI Agent Architecture for Report Generation

This document outlines the new AI agent-driven architecture for generating overall market reports.

## Overview

The report generation process has been restructured to be AI agent-driven, where an AI agent orchestrates various specialized tools to gather data, analyze markets, and compose comprehensive reports.

## Architecture Components

### 1. Agent Tools (`src/reporting/application/tools.ts`)

The AI agent can use various specialized tools:

#### Market Analysis Tool

- **Purpose**: Analyze market data, trends, and technical indicators
- **Capabilities**: Technical analysis, fundamental analysis, sentiment analysis
- **Output**: Market trend direction, confidence level, key indicators, summary

#### News Sentiment Tool

- **Purpose**: Process financial news for sentiment and market impact
- **Capabilities**: Headline analysis, sentiment scoring, impact assessment
- **Output**: Overall sentiment, sentiment score, top headlines, market impact

#### Risk Assessment Tool

- **Purpose**: Identify market risks and investment opportunities
- **Capabilities**: Risk categorization, probability assessment, opportunity identification
- **Output**: Risk analysis, opportunity analysis, overall risk level

#### Report Composition Tool

- **Purpose**: Generate the final comprehensive report
- **Capabilities**: Content synthesis, markdown generation, insight integration
- **Output**: Complete OverallReport object

### 2. Tool Registry

- **Purpose**: Manage and discover available tools
- **Capabilities**: Tool registration, discovery, and execution
- **Interface**: `ToolRegistry` with methods for tool management

### 3. Agent Orchestrator

- **Purpose**: Coordinate the complete report generation workflow
- **Capabilities**: Workflow orchestration, tool execution, result aggregation
- **Interface**: `AgentOrchestrator` with methods for workflow management

## Workflow

```
1. Market Analysis Tool → Gather market insights
2. News Sentiment Tool → Analyze news impact
3. Risk Assessment Tool → Identify risks/opportunities
4. Report Composition Tool → Generate final report
5. Save to DynamoDB → Persist the report
```

## Implementation Status

### ✅ Completed

- Tool interface definitions
- Basic architecture structure
- Cleaned up unnecessary parameters
- Simplified input/output interfaces

### 🚧 In Progress

- AI agent orchestrator implementation
- Tool registry implementation
- Individual tool implementations

### 📋 Next Steps

1. Implement concrete tool implementations
2. Create AI agent orchestrator
3. Integrate with LLM for intelligent decision making
4. Add comprehensive error handling and logging
5. Implement tool execution monitoring and metrics

## Benefits

1. **Modularity**: Each tool has a single responsibility
2. **Extensibility**: Easy to add new tools and capabilities
3. **AI Integration**: Designed for AI agent orchestration
4. **Testability**: Individual tools can be tested in isolation
5. **Maintainability**: Clear separation of concerns

## Usage Example

```typescript
// Future implementation
const orchestrator = createAgentOrchestrator();
const report = await orchestrator.generateReport({
  marketScope: "CN",
  asOfDate: "2025-01-01",
});
```

## Configuration

- **DynamoDB Tables**: Automatically resolved using `@src/util/dynamodb`
- **Tool Parameters**: Configurable through tool interfaces
- **AI Models**: To be configured through orchestrator setup
