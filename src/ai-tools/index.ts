// Export core types and base functionality
export * from "./base";

// Export market tools
export * from "./market";

// Import specific functions for helper functions
import { createMarketDataTool, createNewsAnalysisTool } from "./market";

/**
 * Get all market analysis tools
 */
export function getMarketAnalysisTools() {
  return [createMarketDataTool(), createNewsAnalysisTool()];
}

/**
 * Get tools for AI agent
 */
export function getAllTools() {
  return getMarketAnalysisTools();
}
