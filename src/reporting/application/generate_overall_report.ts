import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import type { OverallReport } from "../domain/types";
import { createDynamoReportRepository } from "../infrastructure/dynamo_report_repository";
import { createAiAgent } from "./ai_agent";
import { createMarketDataTool, createNewsTool } from "./tools";

export interface GenerateOverallReportInput {
  asOfDate: string;
  marketScope: "CN" | "US" | "GLOBAL";
  systemPrompt: string;
  geminiApiKey: string;
}

/**
 * AI Agent-driven overall report generation workflow.
 * Uses Gemini 2.5 Flash to generate reports with available tools.
 */
export async function generateOverallReport(
  input: GenerateOverallReportInput
): Promise<OverallReport> {
  const { asOfDate, marketScope, systemPrompt, geminiApiKey } = input;

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Initialize AI agent with Gemini
  const aiAgent = createAiAgent(geminiApiKey);

  // Register available tools
  aiAgent.registerTool(createMarketDataTool());
  aiAgent.registerTool(createNewsTool());

  // Generate report using AI agent
  const report = await aiAgent.generateOverallReport({
    asOfDate,
    marketScope,
    systemPrompt,
  });

  // Save report to database
  await repo.save(report);

  return report;
}
