/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * IndexData table (time series for index/ETF quotes)
 */
export function createIndexDataTable() {
  const indexDataTable = new sst.aws.Dynamo("IndexData", {
    fields: {
      pk: "string",
      sk: "string",
      gsi1pk: "string",
      gsi1sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    globalIndexes: {
      bySymbol: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
    },
    transform: {
      table: {
        name: `${$app.name}-${$app.stage}-IndexDataTable`,
      },
    },
  });
  return indexDataTable;
}
