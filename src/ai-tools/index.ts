export * from "./base";
export * from "./bloomberg-news";
export * from "./macro";
export * from "./sector";

// import { MacroLiquiditySnapshotTool } from "./macro";
import { BloombergNewsTool } from "./bloomberg-news";

// import { SectorRotationValuationTool } from "./sector";

/**
 * Get tools set for Overall Report generation (NIA/MLS/SRV)
 */
export function getOverallReportTools() {
  return [
    BloombergNewsTool,
    // MacroLiquiditySnapshotTool,
    // SectorRotationValuationTool,
  ];
}
