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
  return [
    BloombergNewsTool,
    GoogleNewsTool,
    MacroLiquiditySnapshotTool,
    // SectorRotationValuationTool,
  ];
}
