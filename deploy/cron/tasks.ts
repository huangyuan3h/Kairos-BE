/// <reference path="../../.sst/platform/config.d.ts" />
/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
import { getGeminiApiKey, getLangfuseSecrets } from "../secrets";

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

  // Synchronize CN & US stock catalogs monthly on the 1st (00:00 UTC)
  const syncMarketData = new sst.aws.Cron("SyncMarketData", {
    // EventBridge cron: minute hour day-of-month month day-of-week year
    // Runs at 00:00 UTC on day 1 of every month
    schedule: "cron(0 0 1 * ? *)",
    function: {
      // Use absolute handler path; SST will package its directory for Python
      handler: "functions/python/sync_market_data.handler",
      runtime: "python3.11",
      python: { container: true },
      timeout: "15 minutes",
      memory: "2048 MB",
      storage: "1 GB",
      link: [database.marketDataTable],
      environment: {
        MARKET_DATA_TABLE: database.marketDataTable.name,
      },
    },
  });

  // Generate CN stock market overall report daily at 18:00 China time (10:00 UTC)
  const overallReport = new sst.aws.Cron("GenerateOverallReport", {
    // Runs at 10:00 UTC (18:00 China time) every day
    schedule: "cron(0 10 * * ? *)",
    function: {
      handler: "functions/nodejs/overall_report.handler",
      runtime: "nodejs20.x",
      timeout: "15 minutes",
      memory: "1024 MB",
      link: [database.marketDataTable, database.reportsTable],
      environment: {
        STAGE: $app.stage, // Explicitly set stage for proper table name resolution
        GOOGLE_GENERATIVE_AI_API_KEY: geminiApiKey,
        LANGFUSE_PUBLIC_KEY: langfuse.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: langfuse.LANGFUSE_SECRET_KEY,
        LANGFUSE_BASE_URL: langfuse.LANGFUSE_HOST,
      },
    },
  });

  // Sync main index/ETF daily quotes with 3-year backfill & gap-filling
  // Runs at 08:00 UTC (16:00 China time) daily before 18:00 report
  const syncIndexQuotes = new sst.aws.Cron("SyncIndexQuotes", {
    schedule: "cron(0 8 * * ? *)",
    function: {
      handler: "functions/python/sync_index_quotes.handler",
      runtime: "python3.11",
      python: { container: true },
      timeout: "15 minutes",
      memory: "2048 MB",
      storage: "1 GB",
      link: [database.indexDataTable, database.marketDataTable],
      environment: {
        INDEX_DATA_TABLE: database.indexDataTable.name,
        MARKET_DATA_TABLE: database.marketDataTable.name,
      },
    },
  });

  return {
    syncMarketData,
    syncIndexQuotes,
    overallReport,
  };
}
