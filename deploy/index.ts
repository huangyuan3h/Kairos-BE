import { createLinkables } from "./shared/linkables";
import { createDatabase } from "./database/dynamodb";
import { createCronJobs } from "./cron/tasks";
import { createRestApi } from "./api/rest";
import { createGraphQLApi } from "./api/graphql";
import { createAuth } from "./auth/cognito";
/**
 * Main deployment configuration
 * Orchestrates all infrastructure resources
 */
export function createInfrastructure() {
  // Create shared resources first
  const linkables = createLinkables();

  // Create database resources
  const database = createDatabase();

  // Create authentication resources
  // const auth = createAuth();

  // Create API resources
  // const restApi = createRestApi(linkables);
  // const graphqlApi = createGraphQLApi(linkables);

  // Create cron jobs
  const cronJobs = createCronJobs(linkables);

  return {
    linkables,
    database,
    // auth,
    // restApi,
    // graphqlApi,
    cronJobs,
  };
}
