/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * MarketData table (single-table design for catalogs and metadata)
 */
export function createMarketDataTable() {
  const marketDataTable = new sst.aws.Dynamo("MarketData", {
    fields: {
      pk: "string",
      sk: "string",
      gsi1pk: "string",
      gsi1sk: "string",
      gsi2pk: "string",
      gsi2sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    globalIndexes: {
      bySymbol: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      byMarketStatus: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
    },
    transform: {
      table: {
        name: `${$app.name}-${$app.stage}-MarketDataTable`,
      },
    },
  });
  return marketDataTable;
}
