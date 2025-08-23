/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
export function createCronJobs(
  linkables: { linkableValue: any },
  database: { marketDataTable: any; reportsTable: any }
) {
  // No Lambda Layer: Python deps are handled by container packaging

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

  // Generate CN stock market overall report daily at 01:00 UTC
  const overallReport = new sst.aws.Cron("GenerateOverallReport", {
    // Runs at 01:00 UTC every day
    schedule: "cron(0 1 * * ? *)",
    function: {
      handler: "functions/nodejs/overall_report.handler",
      runtime: "nodejs20.x",
      timeout: "15 minutes",
      memory: "1024 MB",
      link: [database.marketDataTable, database.reportsTable],
      environment: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
      },
    },
  });

  return {
    syncMarketData,
    overallReport,
  };
}
