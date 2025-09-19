/// <reference path="../../.sst/platform/config.d.ts" />
/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
import { getGeminiApiKey, getLangfuseSecrets } from "../secrets";
import { createSyncMarketDataCron } from "./jobs/sync-market-data";
import { createSyncIndexQuotesCron } from "./jobs/sync-index-quotes";
import { createIngestCnStocksCrons } from "./jobs/ingest-cn-stocks";
import { createOverallReportCron } from "./jobs/overall-report";
import { createCompanySyncCrons } from "./jobs/company-sync";

export async function createCronJobs(
  linkables: { linkableValue: any },
  database: { marketDataTable: any; indexDataTable: any; reportsTable: any; stockDataTable: any; companyTable: any }
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

  // New: Sharded CN A-shares ingestion (default 10 shards) with minute-level staggering
  const ingestCnStocksShards = createIngestCnStocksCrons({ stockDataTable: database.stockDataTable, marketDataTable: database.marketDataTable }, 10);

  const companySyncShards = createCompanySyncCrons({ companyTable: database.companyTable, marketDataTable: database.marketDataTable }, 20);

  return {
    syncMarketData,
    syncIndexQuotes,
    ingestCnStocksShards,
    companySyncShards,
    overallReport,
  };
}
