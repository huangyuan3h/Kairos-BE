import type { OverallReport } from "../domain/types";

export interface MarketDataReader {
  loadFeatures(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

export interface NewsProvider {
  loadHeadlines(params: {
    asOfDate: string;
    marketScope: string;
  }): Promise<unknown>;
}

export interface ReportRepository {
  save(report: OverallReport): Promise<void>;
}

export interface LlmClient {
  generateReport(params: {
    asOfDate: string;
    marketScope: string;
    features: unknown;
    headlines: unknown;
  }): Promise<OverallReport>;
}

export interface ReportingConfig {
  marketDataTableName: string;
  reportsTableName: string;
}
