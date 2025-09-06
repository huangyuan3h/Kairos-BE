export * from "./base";
export * from "./bloomberg-news";
export * from "./macro";
export * from "./news";
export * from "./sector";

// import { MacroLiquiditySnapshotTool } from "./macro";
import { BloombergNewsTool } from "./bloomberg-news";
import { NewsImpactTool } from "./news";
// import { SectorRotationValuationTool } from "./sector";

/**
 * Get tools set for Overall Report generation (NIA/MLS/SRV)
 */
export function getOverallReportTools() {
  return [
    NewsImpactTool,
    BloombergNewsTool,
    // MacroLiquiditySnapshotTool,
    // SectorRotationValuationTool,
  ];
}
