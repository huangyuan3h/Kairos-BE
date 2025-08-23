import type { OverallReport } from "./domain";

/**
 * Market data reader interface
 */
export interface MarketDataReader {
  loadFeatures(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

/**
 * News provider interface
 */
export interface NewsProvider {
  loadHeadlines(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

/**
 * Report repository interface
 */
export interface ReportRepository {
  save(report: OverallReport): Promise<void>;
}
