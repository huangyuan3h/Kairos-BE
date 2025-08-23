import type { MarketDataReader } from "../types/contracts";

// Placeholder: later implement queries to MarketData table
export function createMarketDataReader(): MarketDataReader {
  return {
    async loadFeatures({ asOfDate, marketScope }) {
      return {
        asOfDate,
        marketScope,
        factors: {},
      };
    },
  };
}
