/**
 * Cron job configurations
 * Manages all scheduled tasks and background jobs
 */
export function createCronJobs(
  linkables: { linkableValue: any },
  database: { marketDataTable: any }
) {
  // Synchronize CN & US stock catalogs monthly on the 1st (00:00 UTC)
  const syncMarketData = new sst.aws.Cron("SyncMarketData", {
    // EventBridge cron: minute hour day-of-month month day-of-week year
    // Runs at 00:00 UTC on day 1 of every month
    schedule: "cron(0 0 1 * ? *)",
    function: {
      handler: "functions/src/functions/sync_market_data.handler",
      runtime: "python3.11",
      // Link the DynamoDB table to grant IAM permissions
      link: [database.marketDataTable, linkables.linkableValue],
      // Provide the table name to the function
      environment: {
        MARKET_DATA_TABLE: database.marketDataTable.name,
      },
    },
  });

  return {
    syncMarketData,
  };
}
