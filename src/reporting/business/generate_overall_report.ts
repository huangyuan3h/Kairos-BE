import { getMarketAnalysisTools } from "@/ai-tools";
import { createAiAgent } from "@src/ai-agent/agent";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";
import type { OverallReport } from "../types/domain";

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
    geminiApiKey: _key,
  } = config;

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Initialize AI agent with Gemini
  const aiAgent = createAiAgent({
    model: "gemini-1.5-flash",
    tools: getMarketAnalysisTools(),
  });

  // Create the full prompt for AI agent
  const fullPrompt = `${prompt}

## Available Tools
${getMarketAnalysisTools()
  .map((tool: any) => `- ${tool.name}: ${tool.description}`)
  .join("\n")}

## Current Context
- Date: ${asOfDate}
- Market Scope: ${marketScope}

Please analyze the market and generate a comprehensive report. You can use the available tools if needed.

## Output Format
Please provide your analysis in the following structure:

1. **Title**: A clear title for the report
2. **Content**: Detailed analysis in Markdown format
3. **Summary**: Brief summary of key findings
4. **Opportunities**: List of investment opportunities
5. **Risks**: List of investment risks

Format your response clearly with proper Markdown headings.`;

  // Generate report using AI agent
  const response = await aiAgent.chat([{ role: "user", content: fullPrompt }]);

  // Parse the response and create report structure
  const report: OverallReport = {
    reportId: `REPORT#${marketScope}#OVERALL#${asOfDate}`,
    asOfDate,
    marketScope,
    title: `${marketScope} Market Overall Report - ${asOfDate}`,
    contentMarkdown: response.content || response,
    summary: `AI-generated ${marketScope} market analysis for ${asOfDate}`,
    opportunities: [],
    risks: [],
    promptVersion: "ai-sdk-v5",
    modelVersion: "gemini-1.5-flash",
  };

  // Save report to database
  await repo.save(report);

  return report;
}
