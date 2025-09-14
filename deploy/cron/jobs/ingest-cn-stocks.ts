/// <reference path="../../../.sst/platform/config.d.ts" />

export function createIngestCnStocksCron(database: { stockDataTable: any; marketDataTable: any }) {
  const ingestCnStocks = new sst.aws.Cron("IngestCnStocks", {
    schedule: "cron(10 8 * * ? *)", // 08:10 UTC daily (16:10 China)
    function: {
      handler: "functions/python/sync_cn_stocks.handler",
      runtime: "python3.11",
      python: { container: true },
      timeout: "15 minutes",
      memory: "3072 MB",
      storage: "2 GB",
      link: [database.stockDataTable, database.marketDataTable],
      environment: {
        STOCK_DATA_TABLE: database.stockDataTable.name,
        MARKET_DATA_TABLE: database.marketDataTable.name,
        // Tuning knobs; safe defaults for first run
        MAX_CONCURRENCY: "16",
        BACKFILL_DAYS: "5",
        FULL_BACKFILL_YEARS: "0",
        SHARD_TOTAL: "1",
        SHARD_INDEX: "0",
        ENFORCE_TRADING_DAY: "true",
      },
    },
  });
  return ingestCnStocks;
}
