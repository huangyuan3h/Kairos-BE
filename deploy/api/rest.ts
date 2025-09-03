/**
 * REST API configurations
 * Manages all REST API endpoints and related resources
 */

// Global sst declaration
declare const sst: any;
export function createRestApi(
  linkables: { linkableValue: any },
  database: { reportsTable: any; marketDataTable?: any },
  options?: { isProduction?: boolean; stage?: string }
) {
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
          name: "api.kairos-2.it-t.xyz",
          dns: sst.cloudflare.dns(),
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

  return {
    api,
  };
}
