import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";
import type { OverallReport } from "../types/domain";
import { createAiAgent } from "./ai_agent";
import { createMarketDataTool, createNewsTool } from "./tools";

/**
 * AI Agent-driven overall report generation workflow.
 * Uses Gemini 2.5 Flash to generate reports with available tools.
 */
export async function generateOverallReport(): Promise<OverallReport> {
  // Get configuration from environment variables
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // System prompt for the AI agent
  const systemPrompt = `你是一位专业的中国股市分析师，擅长自上而下的投资分析方法。

请对中国股市进行自上而下的分析，最终挑选出1个最具投资价值的板块和该板块内3只最具潜力的股票。

## 分析框架
1. 宏观环境分析：分析当前经济基本面、政策环境和市场情绪
2. 板块选择：基于宏观分析，选择1个最具投资价值的板块
3. 个股筛选：在选定板块内挑选3只最具潜力的股票

## 输出格式
请按照Markdown格式输出，包含宏观分析、板块选择、个股推荐和投资建议。

## 注意事项
- 这是POC测试，重点验证分析框架
- 基于你的知识进行合理分析
- 保持逻辑清晰和结构完整
- 使用专业的投资分析术语`;

  // Use provided input or create default configuration
  const config = {
    asOfDate: new Date().toISOString().slice(0, 10),
    marketScope: "CN" as const,
    systemPrompt,
    geminiApiKey,
  };

  const {
    asOfDate,
    marketScope,
    systemPrompt: prompt,
    geminiApiKey: key,
  } = config;

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Initialize AI agent with Gemini
  const aiAgent = createAiAgent(key);

  // Register available tools
  aiAgent.registerTool(createMarketDataTool());
  aiAgent.registerTool(createNewsTool());

  // Generate report using AI agent
  const report = await aiAgent.generateOverallReport({
    asOfDate,
    marketScope,
    systemPrompt: prompt,
  });

  // Save report to database
  await repo.save(report);

  return report;
}
