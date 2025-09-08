export * from "./base";
export * from "./bloomberg-news";
export * from "./google-news";
export * from "./macro";
export * from "./sector";

import { BloombergNewsTool } from "./bloomberg-news";
import { GoogleNewsTool } from "./google-news";
import { MacroLiquiditySnapshotTool } from "./macro";

// import { SectorRotationValuationTool } from "./sector";

/**
 * Get tools set for Overall Report generation (NIA/MLS/SRV)
 */
export function getOverallReportTools() {
  // Return a named tool set so the model can call tools by name deterministically
  // Names must match the keys used in prompts/toolChoice.
  return {
    bloomberg_news: BloombergNewsTool,
    google_news: GoogleNewsTool,
    macro_liquidity_snapshot: MacroLiquiditySnapshotTool,
    // sector_rotation: SectorRotationValuationTool,
  } as const;
}
