/// <reference path="../../../.sst/platform/config.d.ts" />

/**
 * Quarterly company sync (CN only for now), sharded into 20 Lambdas
 * - Stagger minutes to avoid burst
 */
export function createCompanySyncCrons(
  database: { companyTable: any; marketDataTable: any },
  numShards: number = 20
) {
  const crons: Record<string, any> = {};
  for (let i = 0; i < numShards; i++) {
    const minuteOffset = 10 + i; // 22:10 .. 22:29 UTC
    const name = `CompanySyncCn-${i}`;
    crons[name] = new sst.aws.Cron(name, {
      schedule: `cron(${minuteOffset} 22 1 2,5,9,11 ? *)`,
      function: {
        handler: "functions/python/sync_company.handler",
        runtime: "python3.11",
        python: { container: true },
        timeout: "15 minutes",
        memory: "2048 MB",
        storage: "1 GB",
        link: [database.companyTable, database.marketDataTable],
        environment: {
          COMPANY_TABLE: database.companyTable.name,
          MARKET_DATA_TABLE: database.marketDataTable.name,
          // Sharding only; keep concurrency low per shard to avoid anti-bot
          SHARD_TOTAL: String(numShards),
          SHARD_INDEX: String(i),
          // no MAX_CONCURRENCY env; Python runs sequentially per shard
        },
      },
    });
  }
  return crons;
}


