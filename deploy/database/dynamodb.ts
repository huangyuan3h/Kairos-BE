/**
 * DynamoDB database resources
 * Manages all database tables and related configurations
 */
export function createDatabase() {
  // Market data table for storing financial market information
  const marketDataTable = new sst.aws.Dynamo("MarketData", {
    fields: {
      pk: "string",
      sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  });

  return {
    marketDataTable,
  };
}
