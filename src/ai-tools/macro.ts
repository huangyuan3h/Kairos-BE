import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * Macro & Liquidity Snapshot (MLS)
 *
 * Purpose:
 * - Provide compact macro bullets and a simple risk regime classification
 * - Feed the "Macro Environment (3–5 bullets)" section with directionality
 *
 * Design:
 * - Minimal indicator set by scope; short-window deltas for direction
 * - Transparent, rules-first regime mapping; favors interpretability and speed
 * - Never throws: returns Result with best-effort snapshot and bullets
 */

const IndicatorsEnum = z.enum([
  "UST2Y",
  "UST10Y",
  "DXY",
  "VIX",
  "WTI",
  "GOLD",
  "COPPER",
  "CN_R007",
  "CN_MLF",
  "EUROSTOXX_VSTOXX",
]);

const inputSchema = z.object({
  marketScope: z.enum(["CN", "US", "GLOBAL"]),
  indicators: z.array(IndicatorsEnum).optional(),
  windowDays: z.number().int().positive().max(30).default(7),
});

export type MacroSnapshotOutput = {
  snapshot: {
    rates: {
      UST2Y?: number;
      UST10Y?: number;
      CN_R007?: number;
      CN_MLF?: number;
    };
    fx: { DXY?: number };
    vol: { VIX?: number; VSTOXX?: number };
    commodities: { WTI?: number; GOLD?: number; COPPER?: number };
    deltas: Record<string, number>;
  };
  regime: "RiskOn" | "Neutral" | "RiskOff";
  bullets: string[];
};

export const MacroLiquiditySnapshotTool = defineTool<
  z.infer<typeof inputSchema>,
  MacroSnapshotOutput
>({
  name: "macro_liquidity_snapshot",
  description:
    "Provide compact macro & liquidity bullets with regime classification",
  category: ToolCategory.MACRO,
  schema: inputSchema,
  async handler(_input) {
    // Mock data; replace with providers later
    const snapshot = {
      rates: { UST2Y: 4.21, UST10Y: 3.98 },
      fx: { DXY: 103.2 },
      vol: { VIX: 13.4, VSTOXX: 16.1 },
      commodities: { WTI: 76.3, GOLD: 2042, COPPER: 3.9 },
      deltas: { UST10Y: -0.05, DXY: 0.4 },
    };
    const bullets = [
      "Yields decline; USD steady (up)",
      "Volatility remains subdued",
      "Crude oil rebounds; gold stabilizes",
    ];
    return { ok: true, data: { snapshot, regime: "Neutral", bullets } };
  },
});
