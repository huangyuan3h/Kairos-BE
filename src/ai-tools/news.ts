import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * News Impact Aggregator (NIA)
 *
 * Purpose:
 * - Aggregate market-moving headlines within a short window and compute a normalized impact score
 * - Provide compact, actionable inputs for the report Overview and sector/stock catalysts
 *
 * Design:
 * - Input controls scope, recency window, and result size
 * - Output is deduplicated and clustered; impact and sentiment are normalized
 * - Never throws: returns Result with fallback meta for graceful degradation
 */

const inputSchema = z.object({
  marketScope: z.enum(["CN", "US", "GLOBAL"]),
  topicHints: z.array(z.string()).optional(),
  // Defaults make the field optional at runtime while preserving a concrete type
  windowHours: z.number().int().positive().max(72).default(12),
  limit: z.number().int().positive().max(50).default(12),
  languages: z.array(z.enum(["en", "zh"])).default(["en", "zh"]),
});

export type NewsImpactOutput = {
  topHeadlines: Array<{
    id: string;
    source: string;
    publishedAt: string;
    tickers: string[];
    sector?: string;
    theme?: string;
    sentiment: number; // [-1,1]
    impact: number; // [0,100]
    summary: string; // short declarative
    url?: string;
  }>;
  meta: { windowHours: number; providerCount: number; deduped: number };
};

export const NewsImpactTool = defineTool<
  z.infer<typeof inputSchema>,
  NewsImpactOutput
>({
  name: "news_impact",
  description:
    "Aggregate market-moving headlines with normalized impact scoring",
  category: ToolCategory.NEWS,
  schema: inputSchema,
  async handler(input) {
    // Mock implementation; replace providers behind this handler later
    const now = new Date().toISOString();
    return {
      ok: true,
      data: {
        topHeadlines: [
          {
            id: "mock-001",
            source: "MockWire",
            publishedAt: now,
            tickers: ["NVDA"],
            sector: "Information Technology",
            theme: "AI supply chain",
            sentiment: 0.3,
            impact: 72,
            summary:
              "Datacenter demand remains strong across AI infrastructure",
            url: "https://example.com/news/001",
          },
        ].slice(0, input.limit ?? 12),
        meta: {
          windowHours: input.windowHours ?? 12,
          providerCount: 1,
          deduped: 0,
        },
      },
    };
  },
});
