/// <reference path="../../../.sst/platform/config.d.ts" />

export function createSyncIndexQuotesCron(database: { indexDataTable: any; marketDataTable: any }) {
  const syncIndexQuotes = new sst.aws.Cron("SyncIndexQuotes", {
    schedule: "cron(0 8 * * ? *)", // 08:00 UTC daily (16:00 China)
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
  return syncIndexQuotes;
}
