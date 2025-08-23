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
      table: {
        name: `${$app.name}-${$app.stage}-MarketDataTable`,
      },
    },
  });

  // Reports table for storing daily overall reports (non user-specific)
  // Data shape (non-exhaustive; only keys are defined at table creation time):
  // {
  //   pk: "REPORT#OVERALL#CN",               // Partition by report scope (market, type)
  //   sk: "DATE#2025-01-01",                 // Sort by date to fetch the latest with ScanIndexForward=false
  //   asOfDate: "2025-01-01",                // ISO date (redundant for convenience)
  //   marketScope: "CN",                      // Market coverage
  //   title: "CN Market Overall Report",      // Human-readable title
  //   content_markdown: "# ...",              // Long-form markdown content
  //   summary: "...",                         // Short summary used in listings
  //   modelVersion: "gpt-4o-...",             // LLM/model information
  //   promptVersion: "v1",                    // Prompt template version
  //   // other structured fields (opportunities/risks) live alongside markdown
  // }
  //
  // Access patterns:
  // - Get latest overall report for CN: Query pk="REPORT#OVERALL#CN" with ScanIndexForward=false, Limit=1
  // - List recent N overall reports for CN: same query with Limit=N
  // - Cross-scope queries (e.g., latest across multiple markets) can be supported
  //   later by adding a GSI if needed (eg. gsi1pk="REPORT#OVERALL", gsi1sk="DATE#<iso>"),
  //   but the primary index is sufficient for the common per-scope latest use case.
  //
  // Future user-specific reports:
  // - Option A (recommended): create a separate UserReports table to isolate retention,
  //   access policies, and capacity. Suggested keys: pk="USER#<userId>#REPORT", sk="DATE#<iso>".
  // - Option B: keep a single table and use different pk prefixes (eg. "USER#...") for multi-tenant
  //   separation. This reduces infra count but mixes workloads.
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

  return {
    marketDataTable,
    reportsTable,
  };
}
