/// <reference path="../../.sst/platform/config.d.ts" />
import { GraphQLApiResources, LinkableResources } from "../types";

/**
 * GraphQL API configurations
 * Manages all GraphQL endpoints and schema definitions
 */
export function createGraphQLApi(linkables: { linkableValue: any }) {
  // GraphQL API using AppSync or similar service
  // This is a placeholder for future GraphQL implementation
  const graphqlApi = new sst.aws.ApiGatewayV2("GraphQLApi", {
    routes: {
      "POST /graphql": {
        function: {
          handler: "functions/src/functions/graphql.handler",
          runtime: "python3.11",
          link: [linkables.linkableValue],
        },
      },
    },
  });

  return {
    graphqlApi,
  };
}
