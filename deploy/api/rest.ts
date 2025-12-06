/**
 * REST API configurations
 * Manages all REST API endpoints and related resources
 */
/// <reference path="../../.sst/platform/config.d.ts" />
// Global sst declaration
declare const sst: any;
export function createRestApi(
  linkables: { linkableValue: any },
  database: { reportsTable: any; marketDataTable?: any; indexDataTable?: any; stockDataTable?: any; companyTable?: any },
  options?: { isProduction?: boolean; stage?: string }
) {
  const prodDnsAdapter = options?.isProduction ? sst.cloudflare.dns() : undefined;

  // Main REST API gateway
  const api = new sst.aws.ApiGatewayV2("MainApi", {
    cors: {
      allowOrigins: [
        "http://localhost:3000",
        "https://kairos-2.it-t.xyz",
        "https://www.kairos-2.it-t.xyz",
      ],
      allowMethods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD",
      ],
      allowHeaders: ["*"],
      exposeHeaders: [],
      maxAge: "1 day",
    },
    domain: options?.isProduction
      ? {
          // ApiGatewayV2 automatically provisions an ACM certificate when a DNS adapter is provided.
          name: "api.kairos-2.it-t.xyz",
          dns: prodDnsAdapter,
        }
      : undefined,
  });

  api.route("GET /reports", {
    handler: "functions/nodejs/get_report.handler",
    runtime: "nodejs20.x",
    link: [linkables.linkableValue, database.reportsTable],
    environment: {
      STAGE: options?.stage ?? "dev",
      REPORTS_TABLE: database.reportsTable.name,
    },
  });

  api.route("GET /reports/{id}", {
    handler: "functions/nodejs/get_report_by_id.handler",
    runtime: "nodejs20.x",
    link: [linkables.linkableValue, database.reportsTable],
    environment: {
      STAGE: options?.stage ?? "dev",
      REPORTS_TABLE: database.reportsTable.name,
    },
  });

  // Catalog fuzzy search (stocks/index/etf) backed by MarketData table
  // Query params:
  // - q: string (required) - name or symbol substring (case-sensitive for now)
  // - market: optional (e.g., CN_A, US, INDEX, ETF); when provided, narrows to one GSI2 partition
  // - limit: optional number (default 20)
  if (database.marketDataTable) {
    api.route("GET /catalog/search", {
      handler: "functions/nodejs/search_catalog.handler",
      runtime: "nodejs20.x",
      link: [database.marketDataTable],
      environment: {
        MARKET_DATA_TABLE: database.marketDataTable.name,
      },
    });
  }

  if (
    database.marketDataTable &&
    database.stockDataTable &&
    database.indexDataTable
  ) {
    api.route("GET /catalog/list", {
      handler: "functions/nodejs/list_catalog.handler",
      runtime: "nodejs20.x",
      link: [
        database.marketDataTable,
        database.stockDataTable,
        database.indexDataTable,
      ],
      environment: {
        MARKET_DATA_TABLE: database.marketDataTable.name,
        STOCK_DATA_TABLE: database.stockDataTable.name,
        INDEX_DATA_TABLE: database.indexDataTable.name,
      },
    });
  }

  // Time series query for a code within a date window (default last 120 days)
  // Query params:
  // - code: string (required)
  // - asset: optional ("index" | "stock"); if omitted, handler will try index then stock
  // - from: optional (YYYY-MM-DD)
  // - to: optional (YYYY-MM-DD)
  // - days: optional number; used when from/to not provided; default 120
  if (database.indexDataTable && database.stockDataTable) {
    api.route("GET /timeseries", {
      handler: "functions/nodejs/get_timeseries.handler",
      runtime: "nodejs20.x",
      link: [database.indexDataTable, database.stockDataTable],
      environment: {
        INDEX_DATA_TABLE: database.indexDataTable.name,
        STOCK_DATA_TABLE: database.stockDataTable.name,
      },
    });

    api.route("GET /snapshot", {
      handler: "functions/nodejs/get_snapshot.handler",
      runtime: "nodejs20.x",
      link: [database.indexDataTable, database.stockDataTable],
      environment: {
        INDEX_DATA_TABLE: database.indexDataTable.name,
        STOCK_DATA_TABLE: database.stockDataTable.name,
      },
    });
  }

  // Company lookup by code (profile/master record)
  // Query params:
  // - code: string (required)
  if (database.companyTable) {
    api.route("GET /company", {
      handler: "functions/nodejs/get_company.handler",
      runtime: "nodejs20.x",
      link: [database.companyTable],
      environment: {
        COMPANY_TABLE: database.companyTable.name,
      },
    });
  }

  return {
    api,
  };
}
