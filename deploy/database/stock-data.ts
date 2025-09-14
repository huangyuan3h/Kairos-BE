/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * StockData table (time series for equities daily OHLCV)
 * Key design mirrors IndexData for simplicity and reuse.
 */
export function createStockDataTable() {
  const stockDataTable = new sst.aws.Dynamo("StockData", {
    fields: {
      pk: "string",
      sk: "string",
      gsi1pk: "string",
      gsi1sk: "string",
      // Optional GSI for date-based fan-out if added later
      // gsi2pk: "string",
      // gsi2sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    globalIndexes: {
      bySymbol: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      // byDate: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
    },
    transform: {
      table: {
        name: `${$app.name}-${$app.stage}-StockDataTable`,
      },
    },
  });
  return stockDataTable;
}
