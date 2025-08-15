import { z } from "zod";
import type { AiAgentTool } from "../ai_agent";

/**
 * Simple market data tool for demonstration
 */
export class MarketDataTool implements AiAgentTool {
  name = "market_data";
  description = "Get basic market data and trends for analysis";
  
  // Parameters schema for AI SDK 5
  parameters = z.object({
    marketScope: z.enum(["CN", "US", "GLOBAL"]).describe("Market scope to analyze"),
    asOfDate: z.string().describe("Date for the analysis"),
  });

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const { marketScope, asOfDate } = params;

    // This is a mock implementation - in production you'd fetch real data
    return {
      marketScope,
      asOfDate,
      data: {
        trend: "BULLISH",
        confidence: 0.75,
        keyIndicators: [
          {
            name: "Market Sentiment",
            value: 0.8,
            interpretation: "Positive market sentiment",
          },
          {
            name: "Volume Trend",
            value: 0.6,
            interpretation: "Moderate volume increase",
          },
          {
            name: "Volatility",
            value: 0.4,
            interpretation: "Low volatility period",
          },
        ],
        summary: `Market analysis for ${marketScope} on ${asOfDate} shows positive trends with moderate volume and low volatility.`,
      },
    };
  }
}

export function createMarketDataTool(): MarketDataTool {
  return new MarketDataTool();
}
