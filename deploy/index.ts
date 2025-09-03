import { createRestApi } from "./api/rest";
import { createCronJobs } from "./cron/tasks";
import { createDatabase } from "./database/dynamodb";
import { createLinkables } from "./shared/linkables";
/**
 * Main deployment configuration
 * Orchestrates all infrastructure resources
 */
export async function createInfrastructure(env?: {
  isProduction?: boolean;
  stage?: string;
}) {
  // Create shared resources first
  const linkables = createLinkables();

  // Create database resources
  const database = createDatabase();

  // Create authentication resources
  // const auth = createAuth();

  // Create API resources
  const restApi = createRestApi(linkables, database, {
    isProduction: env?.isProduction === true,
    stage: env?.stage,
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
