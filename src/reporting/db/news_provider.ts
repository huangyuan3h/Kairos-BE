import type { NewsProvider } from "../types/contracts";

// Placeholder implementation; later integrate real news sources.
export function createNewsProvider(): NewsProvider {
  return {
    async loadHeadlines({ asOfDate, marketScope }) {
      return {
        asOfDate,
        marketScope,
        headlines: [],
      };
    },
  };
}
