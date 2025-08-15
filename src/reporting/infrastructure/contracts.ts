import type { OverallReport } from "../domain/types";

/**
 * Market data analysis tool interface for AI agent
 */
export interface MarketDataReader {
  loadFeatures(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

/**
 * News and sentiment analysis tool interface for AI agent
 */
export interface NewsProvider {
  loadHeadlines(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

/**
 * Report persistence tool interface for AI agent
 */
export interface ReportRepository {
  save(report: OverallReport): Promise<void>;
}

/**
 * AI report generation tool interface for AI agent
 */
export interface LlmClient {
  generateReport(params: {
    asOfDate: string;
    marketScope: string;
    features: unknown;
    headlines: unknown;
  }): Promise<OverallReport>;
}
