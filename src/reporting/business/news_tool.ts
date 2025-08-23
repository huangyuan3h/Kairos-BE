import { z } from "zod";
import type { AiAgentTool } from "./ai_agent";

/**
 * Simple news tool for demonstration
 */
export class NewsTool implements AiAgentTool {
  name = "news_analysis";
  description = "Analyze recent news headlines for market impact";

  // Parameters schema for AI SDK 5
  parameters = z.object({
    marketScope: z
      .enum(["CN", "US", "GLOBAL"])
      .describe("Market scope to analyze"),
    asOfDate: z.string().describe("Date for the analysis"),
    timeRange: z
      .enum(["1d", "3d", "1w"])
      .optional()
      .describe("Time range for news analysis"),
  });

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const { marketScope, asOfDate } = params;

    // This is a mock implementation - in production you'd fetch real news data
    return {
      marketScope,
      asOfDate,
      news: {
        overallSentiment: "POSITIVE",
        sentimentScore: 0.7,
        topHeadlines: [
          {
            title: "Economic Recovery Shows Strong Momentum",
            sentiment: "POSITIVE",
            impact: "HIGH",
            summary: "Latest economic data indicates strong recovery trends",
          },
          {
            title: "Policy Support Continues for Key Industries",
            sentiment: "POSITIVE",
            impact: "MEDIUM",
            summary:
              "Government announces continued support for strategic sectors",
          },
          {
            title: "Market Volatility Remains Low",
            sentiment: "NEUTRAL",
            impact: "LOW",
            summary: "Market conditions remain stable with low volatility",
          },
        ],
        marketImpact: `News analysis for ${marketScope} on ${asOfDate} shows positive sentiment with strong economic recovery signals.`,
      },
    };
  }
}

export function createNewsTool(): NewsTool {
  return new NewsTool();
}
