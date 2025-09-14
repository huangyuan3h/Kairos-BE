/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * MarketData table (single-table design for catalogs and metadata)
 *
 * Item shapes (selected)
 * ----------------------
 * 1) Stock catalog (latest snapshot)
 *    pk:    "STOCK#<symbol>"
 *    sk:    "META#CATALOG"                // stable, always latest
 *    gsi1pk:"SYMBOL#<symbol>"             // bySymbol timeline/index
 *    gsi1sk:"ENTITY#CATALOG"              // entity scope for symbol index
 *    gsi2pk:"MARKET#<market>#STATUS#<status>" // byMarketStatus partition
 *    gsi2sk:"ENTITY#CATALOG"              // entity scope for market-status index
 *    attrs: symbol, name, exchange, asset_type, market, status
 *
 * 2) Daily quotes (if stored in this table)
 *    pk:    "STOCK#<symbol>"
 *    sk:    "QUOTE#YYYY-MM-DD"
 *    gsi1pk:"SYMBOL#<symbol>"
 *    gsi1sk:"ENTITY#QUOTE#YYYY-MM-DD"
 *    attrs: symbol, date, open, high, low, close, adj_close?, volume?, ...
 *
 * Access patterns
 * ---------------
 * - Get catalog by symbol: GetItem(pk, sk=META#CATALOG)
 * - Fuzzy list by market/status: Query GSI2 (gsi2pk=MARKET#<market>#STATUS#ACTIVE) + FilterExpression on name/symbol
 * - Latest quote by symbol: Query GSI1 (gsi1pk=SYMBOL#<symbol>, begins_with gsi1sk, ScanIndexForward=false, Limit=1)
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
