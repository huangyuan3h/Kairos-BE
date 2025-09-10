import { LangfuseClient } from "@langfuse/client";
import { createObjectAgentWithSchema } from "@src/ai-agent/agent";
import { getOverallReportTools } from "@src/ai-tools";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import "dotenv/config";
import { z } from "zod";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";
import type { OverallReport } from "../types/domain";
import { getLogger } from "@src/util/logger";

/**
 * Simplified AI Agent-driven overall report generation workflow.
 * Uses Gemini 2.5 Flash with a strict, news-focused system prompt.
 */

// Define schema for report generation
const reportSchema = z.object({
  title: z
    .string()
    .describe("Report title in Chinese, should be concise and professional"),
  content: z
    .string()
    .describe(
      "Detailed market analysis content in Chinese, including investment suggestions and market insights"
    ),
});

export async function generateOverallReport(): Promise<OverallReport> {
  const logger = getLogger("reporting/generate_overall_report");
  // Get configuration from environment variables
  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY environment variable is required"
    );
  }

  // Create configuration
  const asOfDate = new Date().toISOString().slice(0, 10);

  // Require Langfuse-managed prompt; do not fallback locally
  const langfuse = new LangfuseClient();
  const p = await langfuse.prompt.get("report/overall_system");
  if (!p) {
    throw new Error(
      "Missing Langfuse prompt: 'report/overall_system'. Please create it before generating reports."
    );
  }
  const systemPrompt: string = p.compile({ asOfDate });
  const createdAt = new Date().toISOString();

  // Initialize repository for saving the final report
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Get tools and add debugging (local execution; do not pass to the model)
  const toolset = getOverallReportTools();
  logger.debug({ tools: Object.keys(toolset) }, "Available tools");
  logger.debug({ systemPrompt }, "System prompt");

  // Execute tools locally and build compact context JSON
  const newsWindowHours = Number(process.env.NEWS_WINDOW_HOURS || 24);
  const newsLimit = Number(process.env.NEWS_LIMIT || 20);
  const macroWindowDays = Number(process.env.MACRO_WINDOW_DAYS || 7);

  type AnyResult = { ok: boolean; data?: any; error?: string } | undefined;
  let bRes: AnyResult;
  let gRes: AnyResult;
  let mRes: AnyResult;
  const errors: string[] = [];

  try {
    bRes = await (toolset as any).bloomberg_news.execute({
      windowHours: Math.max(1, Math.min(72, newsWindowHours)),
      limit: Math.max(1, Math.min(50, newsLimit)),
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`bloomberg_news: ${msg}`);
    bRes = { ok: false, error: msg } as AnyResult;
  }

  try {
    gRes = await (toolset as any).google_news.execute({
      windowHours: Math.max(1, Math.min(72, newsWindowHours)),
      limit: Math.max(1, Math.min(50, newsLimit)),
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`google_news: ${msg}`);
    gRes = { ok: false, error: msg } as AnyResult;
  }

  try {
    mRes = await (toolset as any).macro_liquidity_snapshot.execute({
      windowDays: Math.max(1, Math.min(30, macroWindowDays)),
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`macro_liquidity_snapshot: ${msg}`);
    mRes = { ok: false, error: msg } as AnyResult;
  }

  const bloomItems = Array.isArray(bRes?.data?.items)
    ? (bRes?.data?.items as Array<any>).slice(0, newsLimit).map(i => ({
        title: String(i?.title || ""),
        url: i?.url ? String(i.url) : undefined,
        publishedAt: i?.publishedAt ? String(i.publishedAt) : undefined,
        source: i?.source ? String(i.source) : undefined,
        section: i?.section ? String(i.section) : undefined,
      }))
    : [];

  const googleItems = Array.isArray(gRes?.data?.items)
    ? (gRes?.data?.items as Array<any>).slice(0, newsLimit).map(i => ({
        title: String(i?.title || ""),
        url: i?.url ? String(i.url) : undefined,
        publishedAt: i?.publishedAt ? String(i.publishedAt) : undefined,
        source: i?.source ? String(i.source) : undefined,
        section: i?.section ? String(i.section) : undefined,
      }))
    : [];

  const macro = mRes?.data ?? undefined;

  const context = {
    asOfDate,
    news: {
      bloomberg: bloomItems,
      google: googleItems,
    },
    macro,
    errors,
  } as const;

  logger.debug(
    {
      bloomCount: bloomItems.length,
      googleCount: googleItems.length,
      hasMacro: Boolean(macro),
      errors,
    },
    "Local tools context prepared"
  );

  // Initialize AI agent WITHOUT tools; pass compact context via prompt; force no-tool path
  const aiAgent = createObjectAgentWithSchema({
    model: "gemini-2.5-flash",
    systemPrompt,
    toolChoice: "none",
    schema: reportSchema,
  });

  logger.info("Starting report generation with local tools context");

  // Compose user prompt embedding context JSON
  const userPrompt = `你将获得当日结构化上下文（JSON）。仅基于该上下文，用中文生成一个简洁专业的每日市场简报。严格输出 {title, content} 两个字段，其中 content 允许使用 Markdown。

上下文(JSON)：\n\n\u0060\u0060\u0060json\n${JSON.stringify(context)}\n\u0060\u0060\u0060`;

  const response = await aiAgent.generate(userPrompt);

  logger.debug({ response }, "AI Agent response");

  // Extract structured data from response
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
