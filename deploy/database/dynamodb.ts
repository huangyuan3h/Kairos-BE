/**
 * DynamoDB database resources
 * Manages all database tables and related configurations
 *
 * Example: How an Apple (AAPL) stock catalog record is stored
 *
 * Item shape (single-table design):
 * {
 *   pk:    "STOCK#AAPL",               // Primary partition key
 *   sk:    "META#CATALOG",             // Stable sort key for latest catalog
 *
 *   gsi1pk: "SYMBOL#AAPL",             // GSI1 (bySymbol) hash key
 *   gsi1sk: "ENTITY#CATALOG",          // GSI1 range key for entity scoping
 *
 *   gsi2pk: "MARKET#US#STATUS#ACTIVE", // GSI2 (byMarketStatus) hash key
 *   gsi2sk: "ENTITY#CATALOG",          // GSI2 range key for entity scoping
 *
 *   symbol: "AAPL",
 *   name: "Apple Inc.",
 *   exchange: "NASDAQ",
 *   asset_type: "EQUITY",
 *   market: "US",
 *   status: "ACTIVE"
 * }
 *
 * Query patterns:
 * - bySymbol (GSI1): gsi1pk = SYMBOL#AAPL; optional begins_with(gsi1sk, "ENTITY#CATALOG")
 * - byMarketStatus (GSI2): gsi2pk = MARKET#US#STATUS#ACTIVE; optional begins_with(gsi2sk, "ENTITY#CATALOG")
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
    // Give the DynamoDB table a stable physical name to avoid duplicates
    transform: {
      table: (args) => ({
        ...args,
        name: `${$app.name}-${$app.stage}-MarketDataTable`,
      }),
    },
  });

  return {
    marketDataTable,
  };
}
