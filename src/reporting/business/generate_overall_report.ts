import { getLangfuse } from "@src/ai-agent";
import { createObjectAgentWithSchema } from "@src/ai-agent/agent";
import { getOverallReportTools } from "@src/ai-tools";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import "dotenv/config";
import { z } from "zod";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";
import type { OverallReport } from "../types/domain";

/**
 * Simplified AI Agent-driven overall report generation workflow.
 * Uses Gemini 2.5 Flash with system prompt from Langfuse.
 */

// Define schema for report generation
const reportSchema = z.object({
  title: z
    .string()
    .describe("Report title in Chinese, should be concise and professional"),
  content: z
    .string()
    .describe(
      "Detailed market analysis content in Chinese, including investment suggestions and market insights",
    ),
});

export async function generateOverallReport(): Promise<OverallReport> {
  // Get configuration from environment variables
  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY environment variable is required",
    );
  }

  // Get system prompt from Langfuse
  const langfuse = getLangfuse();
  if (!langfuse) {
    throw new Error("Langfuse not configured");
  }

  // Create configuration
  const asOfDate = new Date().toISOString().slice(0, 10);
  const prompt = await langfuse.getPrompt("report/overall_system");
  if (!prompt) {
    throw new Error(
      "System prompt 'report/overall_system' not found in Langfuse",
    );
  }

  // Compile Langfuse prompt with variables (per official SDK example)
  const systemPrompt: string = (prompt as any).compile({ asOfDate });
  const createdAt = new Date().toISOString();

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Initialize AI agent with Gemini 2.5 Flash and custom schema
  const aiAgent = createObjectAgentWithSchema({
    model: "gemini-2.5-flash", // Use gemini-2.5-flash as requested
    tools: getOverallReportTools(), // Provide NIA/MLS/SRV tools to the agent
    systemPrompt,
    toolChoice: { type: "tool", toolName: "google_news" }, // Force the agent to use at least one tool
    metadata: {
      promptKey: "report/overall_system",
      promptVersion: (prompt as any)?.version,
    },
    schema: reportSchema, // Use custom schema for report generation
  });

  // Generate structured report object using AI agent
  const response = await aiAgent.generate("");

  // Extract structured data from response
  // Note: ai.generateObject returns an object with the parsed payload on `object`
  // We defensively support both shapes to avoid silent undefined writes
  const parsed: any = (response as any)?.object ?? response;
  const reportData = {
    title: parsed?.title,
    content: parsed?.content,
  } as { title: string; content: string };

  if (!reportData?.title || !reportData?.content) {
    throw new Error("AI agent did not return required fields: title/content");
  }

  // Generate unique report ID using timestamp and random suffix
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const reportId = `REPORT#${timestamp}#${randomSuffix}`;

  // Create structured report object with validated data
  const report: OverallReport = {
    reportId,
    asOfDate,
    title: reportData.title,
    content: reportData.content,
    createdAt,
  };

  // Save report to database
  await repo.save(report);

  return report;
}
