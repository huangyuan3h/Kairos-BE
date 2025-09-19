/// <reference path="../../.sst/platform/config.d.ts" />


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
import { createMarketDataTable } from "./market-data";
import { createIndexDataTable } from "./index-data";
import { createReportsTable } from "./reports";
import { createStockDataTable } from "./stock-data";
import { createCompanyTable } from "./company";

export function createDatabase() {
  const marketDataTable = createMarketDataTable();
  const indexDataTable = createIndexDataTable();
  const reportsTable = createReportsTable();
  const stockDataTable = createStockDataTable();
  const companyTable = createCompanyTable();

  return {
    marketDataTable,
    indexDataTable,
    reportsTable,
    stockDataTable,
    companyTable,
  };
}
