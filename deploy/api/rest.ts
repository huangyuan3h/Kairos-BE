/**
 * REST API configurations
 * Manages all REST API endpoints and related resources
 */
export function createRestApi(linkables: { linkableValue: any }) {
  // Main REST API gateway
  const api = new sst.aws.ApiGatewayV2("MainApi", {
    routes: {
      "GET /": {
        function: {
          handler: "functions/src/functions/api.handler",
          runtime: "python3.11",
          link: [linkables.linkableValue],
        },
      },
    },
  });

  return {
    api,
  };
}
