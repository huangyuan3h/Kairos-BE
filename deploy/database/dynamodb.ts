/**
 * DynamoDB database resources
 * Manages all database tables and related configurations
 */
export function createDatabase() {
  // Market data table for storing financial market information
  // Key design:
  // - pk/sk: single-table design for all entities (e.g., STOCK#<symbol>, META#<type>)
  // - gsi1 (bySymbol): query by symbol and optional range for entity scoping
  // - gsi2 (byMarketStatus): query by market + status with optional range
  const marketDataTable = new sst.aws.Dynamo("MarketData", {
    // Base keys + GSI keys
    fields: {
      pk: "string",
      sk: "string",
      // GSI1 for symbol-based queries
      gsi1pk: "string",
      gsi1sk: "string",
      // GSI2 for market+status queries
      gsi2pk: "string",
      gsi2sk: "string",
    },
    primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    globalIndexes: {
      // Example access pattern:
      // - HASH: SYMBOL#<symbol>
      // - RANGE: ENTITY#<type>#<timestamp or sort key>
      bySymbol: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      // Example access pattern:
      // - HASH: MARKET#<market>#STATUS#<status>
      // - RANGE: ENTITY#<type>#<timestamp or sort key>
      byMarketStatus: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
    },
  });

  return {
    marketDataTable,
  };
}
