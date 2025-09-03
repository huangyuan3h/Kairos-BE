/**
 * REST API configurations
 * Manages all REST API endpoints and related resources
 */

// Global sst declaration
declare const sst: any;
export function createRestApi(
  linkables: { linkableValue: any },
  options?: { isProduction?: boolean }
) {
  // Main REST API gateway
  const api = new sst.aws.ApiGatewayV2("MainApi", {
    domain: options?.isProduction
      ? {
          name: "api.kairos-2.it-t.xyz",
          dns: sst.cloudflare.dns(),
        }
      : undefined,
    routes: {
      "GET /reports": {
        function: {
          handler: "functions/nodejs/get_report.handler",
          runtime: "nodejs20.x",
          link: [linkables.linkableValue],
        },
      },
      "GET /reports/{id}": {
        function: {
          handler: "functions/nodejs/get_report_by_id.handler",
          runtime: "nodejs20.x",
          link: [linkables.linkableValue],
        },
      },
    },
  });

  return {
    api,
  };
}
