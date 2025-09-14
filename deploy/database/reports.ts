/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * Reports table (overall reports storage)
 */
export function createReportsTable() {
  const reportsTable = new sst.aws.Dynamo("Reports", {
    fields: {
      pk: "string",
      sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    transform: {
      table: {
        name: `${$app.name}-${$app.stage}-ReportsTable`,
      },
    },
  });
  return reportsTable;
}
