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
  marketScope: z
    .enum(["CN", "US", "GLOBAL"]) // Market geographic scope for sourcing headlines
    .describe("Market scope: CN | US | GLOBAL"),
  topicHints: z
    .array(z.string())
    .describe("Optional topic keywords to bias selection")
    .optional(),
  // Defaults make the field optional at runtime while preserving a concrete type
  windowHours: z
    .number()
    .int()
    .positive()
    .max(72)
    .describe("Recency window in hours (<=72), default 24")
    .default(24),
  limit: z
    .number()
    .int()
    .positive()
    .max(20)
    .describe("Max headlines after dedupe (<=20), default 12")
    .default(12),
});

/**
 * Output shape consumed by the Overall Report generator.
 * - topHeadlines: deduplicated, impact-scored items
 * - meta: small diagnostics to support observability and fallbacks
 */
export type NewsImpactOutput = {
  /** Sorted by impact desc after dedupe/cluster */
  topHeadlines: Array<{
    /** Stable id (e.g., source+timestamp hash) */
    id: string;
    /** Provider/source name */
    source: string;
    /** ISO8601 publish time */
    publishedAt: string;
    /** Related tickers resolved from content */
    tickers: string[];
    /** Optional GICS sector */
    sector?: string;
    /** Short theme label (e.g., "AI supply chain") */
    theme?: string;
    /** Normalized sentiment in [-1, 1] */
    sentiment: number;
    /** Normalized cross-source impact in [0, 100] */
    impact: number;
    /** Short, declarative summary (<= 140 chars recommended) */
    summary: string;
    /** Optional canonical URL */
    url?: string;
  }>;
  meta: {
    /** Effective window in hours used for the query */
    windowHours: number;
    /** Number of sources queried */
    providerCount: number;
    /** Number of items removed by dedupe */
    deduped: number;
  };
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
