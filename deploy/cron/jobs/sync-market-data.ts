/// <reference path="../../.sst/platform/config.d.ts" />

export function createSyncMarketDataCron(database: { marketDataTable: any }) {
  const syncMarketData = new sst.aws.Cron("SyncMarketData", {
    schedule: "cron(0 0 1 * ? *)", // 00:00 UTC on day 1 monthly
    function: {
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
  return syncMarketData;
}
