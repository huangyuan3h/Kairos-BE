/// <reference path="../../.sst/platform/config.d.ts" />
/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
import { getGeminiApiKey, getLangfuseSecrets } from "../secrets";
import { createSyncMarketDataCron } from "./jobs/sync-market-data";
import { createSyncIndexQuotesCron } from "./jobs/sync-index-quotes";
import { createIngestCnStocksCron } from "./jobs/ingest-cn-stocks";
import { createOverallReportCron } from "./jobs/overall-report";

export async function createCronJobs(
  linkables: { linkableValue: any },
  database: { marketDataTable: any; indexDataTable: any; reportsTable: any }
) {
  // No Lambda Layer: Python deps are handled by container packaging

  // Load third-party secrets once for all scheduled functions
  const [geminiApiKey, langfuse] = await Promise.all([
    getGeminiApiKey(),
    getLangfuseSecrets(),
  ]);

  const syncMarketData = createSyncMarketDataCron({ marketDataTable: database.marketDataTable });

  // Generate overall report via a dedicated job file
  const overallReport = createOverallReportCron({
    database: { marketDataTable: database.marketDataTable, reportsTable: database.reportsTable },
    geminiApiKey,
    langfuse,
  });

  const syncIndexQuotes = createSyncIndexQuotesCron({ indexDataTable: database.indexDataTable, marketDataTable: database.marketDataTable });

  // New: Ingest CN A-shares daily OHLCV at 16:10 China time (08:10 UTC)
  const ingestCnStocks = createIngestCnStocksCron({ stockDataTable: database.stockDataTable, marketDataTable: database.marketDataTable });

  return {
    syncMarketData,
    syncIndexQuotes,
    ingestCnStocks,
    overallReport,
  };
}
