import { createRestApi } from "./api/rest";
import { createCronJobs } from "./cron/tasks";
import { createDatabase } from "./database/dynamodb";
import { createLinkables } from "./shared/linkables";
/**
 * Main deployment configuration
 * Orchestrates all infrastructure resources
 */
export async function createInfrastructure(env?: { isProduction?: boolean }) {
  // Create shared resources first
  const linkables = createLinkables();

  // Create database resources
  const database = createDatabase();

  // Create authentication resources
  // const auth = createAuth();

  // Create API resources
  const restApi = createRestApi(linkables, {
    isProduction: env?.isProduction === true,
  });
  // const graphqlApi = createGraphQLApi(linkables);

  // Create cron jobs (requires linkables & database)
  const cronJobs = await createCronJobs(linkables, database);

  return {
    linkables,
    database,
    // auth,
    restApi,
    // graphqlApi,
    cronJobs,
  };
}
