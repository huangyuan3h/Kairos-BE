/// <reference path="../../../.sst/platform/config.d.ts" />

export function createIngestCnStocksCrons(
  database: { stockDataTable: any; marketDataTable: any },
  numShards: number = 10
) {
  const crons: Record<string, any> = {};
  for (let i = 0; i < numShards; i++) {
    // Stagger start minutes to avoid burst on upstream and DynamoDB
    const minuteOffset = 10 + i; // 08:10, 08:11, ...
    const name = `IngestCnStocks-${i}`;
    crons[name] = new sst.aws.Cron(name, {
      schedule: `cron(${minuteOffset} 8 * * ? *)`, // UTC 08:10 + i
      function: {
        handler: "functions/python/sync_cn_stocks.handler",
        runtime: "python3.11",
        python: { container: true },
        timeout: "15 minutes",
        memory: "2048 MB",
        storage: "2 GB",
        link: [database.stockDataTable, database.marketDataTable],
        environment: {
          STOCK_DATA_TABLE: database.stockDataTable.name,
          MARKET_DATA_TABLE: database.marketDataTable.name,
          // Per-shard configuration
          SHARD_TOTAL: String(numShards),
          SHARD_INDEX: String(i),
          // Tuning knobs
          MAX_CONCURRENCY: "6",
          FULL_BACKFILL_YEARS: "3",
          CATCH_UP_MAX_DAYS: "60",
        },
      },
    });
  }
  return crons;
}
