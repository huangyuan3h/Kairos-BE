import { getLangfuse } from "@src/ai-agent";
import { createObjectAgent } from "@src/ai-agent/agent";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";
import type { OverallReport } from "../types/domain";

/**
 * Simplified AI Agent-driven overall report generation workflow.
 * Uses Gemini 2.5 Flash with system prompt from Langfuse.
 */
export async function generateOverallReport(): Promise<OverallReport> {
  // Get configuration from environment variables
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // Get system prompt from Langfuse
  const langfuse = getLangfuse();
  if (!langfuse) {
    throw new Error("Langfuse not configured");
  }

  const prompt = await langfuse.getPrompt("report/overall_system");
  if (!prompt?.prompt) {
    throw new Error(
      "System prompt 'report/overall_system' not found in Langfuse"
    );
  }

  const systemPrompt = prompt.prompt;

  // Create configuration
  const asOfDate = new Date().toISOString().slice(0, 10);
  const createdAt = new Date().toISOString();

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Initialize AI agent with Gemini 2.5 Flash for object generation
  const aiAgent = createObjectAgent({
    model: "gemini-2.5-flash", // Use gemini-2.5-flash as requested
    tools: [], // Empty tools array for testing
    systemPrompt,
  });

  // Generate structured report object using AI agent
  const response = await aiAgent.generate("");

  // Extract structured data from response
  const reportData =
    typeof response === "object" && response !== null
      ? response
      : JSON.parse(typeof response === "string" ? response : "{}");

  // Generate unique report ID using timestamp and random suffix
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const reportId = `REPORT#${timestamp}#${randomSuffix}`;

  // Create structured report object
  const report: OverallReport = {
    reportId,
    asOfDate,
    title: reportData.title || `市场投资分析报告 - ${asOfDate}`,
    content: reportData.content || "报告内容生成失败",
    createdAt,
  };

  // Save report to database
  await repo.save(report);

  return report;
}
