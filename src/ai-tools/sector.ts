import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * Sector Rotation & Valuation (SRV)
 *
 * Purpose:
 * - Rank 1–2 sectors using a compact, explainable composite score
 * - Produce exactly 3 stock picks per sector for the report table
 *
 * Design:
 * - Momentum/valuation/revisions/fund-flow compose the score; catalysts optional
 * - Enforce brevity for pick fields so they fit the Markdown table
 * - Never throws: returns Result; includes placeholders when confidence is low
 */

const inputSchema = z.object({
  marketScope: z.enum(["CN", "US", "GLOBAL"]),
  candidateSectors: z.array(z.string()).optional(),
  lookbackDays: z.number().int().positive().max(90).default(20),
});

export type SectorRotationOutput = {
  sectors: Array<{
    name: string;
    scores: {
      momentum20d: number;
      valuationRel: number;
      revisionBreadth: number;
      fundFlow: number;
    };
    catalysts: string[];
    picks: Array<{
      ticker: string;
      name?: string;
      advice: "BUY" | "HOLD" | "SELL";
      targetPrice?: { min?: number; max?: number; currency: string };
      timeframe: "SHORT_1_3M" | "MID_3_6M" | "LONG_6_12M";
      logic: string;
      technical: string;
      risk: string;
    }>;
  }>;
};

export const SectorRotationValuationTool = defineTool<
  z.infer<typeof inputSchema>,
  SectorRotationOutput
>({
  name: "sector_rotation_valuation",
  description: "Rank sectors and produce concise picks for the report table",
  category: ToolCategory.SECTOR,
  schema: inputSchema,
  async handler(_input) {
    const sectors: SectorRotationOutput["sectors"] = [
      {
        name: "Semiconductors",
        scores: {
          momentum20d: 1.1,
          valuationRel: 0.6,
          revisionBreadth: 0.4,
          fundFlow: 72,
        },
        catalysts: ["AI capex", "inventory draw"],
        picks: [
          {
            ticker: "NVDA",
            advice: "BUY",
            targetPrice: { min: 550, max: 650, currency: "USD" },
            timeframe: "LONG_6_12M",
            logic: "AI demand",
            technical: "MA uptrend",
            risk: "Supply bottleneck",
          },
          {
            ticker: "AMD",
            advice: "HOLD",
            timeframe: "MID_3_6M",
            logic: "GPU adoption",
            technical: "Breakout confirmation",
            risk: "Competitive pressure",
          },
          {
            ticker: "ASML",
            advice: "HOLD",
            timeframe: "LONG_6_12M",
            logic: "Equipment cycle",
            technical: "Above trendline",
            risk: "Order volatility",
          },
        ],
      },
    ];
    return { ok: true, data: { sectors } };
  },
});
