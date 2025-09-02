/**
 * REST API configurations
 * Manages all REST API endpoints and related resources
 */

// Global sst declaration
declare const sst: any;
export function createRestApi(linkables: { linkableValue: any }) {
  // Main REST API gateway
  const api = new sst.aws.ApiGatewayV2("MainApi", {
    routes: {
      "GET /reports": {
        function: {
          handler: "functions/nodejs/get_report.handler",
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
