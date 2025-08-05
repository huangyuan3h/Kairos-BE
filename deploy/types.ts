/**
 * Type definitions for deployment resources
 * Provides better TypeScript support and documentation
 */

// Linkable resources interface
export interface LinkableResources {
  linkableValue: any; // sst.Linkable type
}

// Database resources interface
export interface DatabaseResources {
  marketDataTable: any; // sst.aws.Dynamo type
}

// Auth resources interface
export interface AuthResources {
  userPool: any; // sst.aws.Cognito type
  identityPool: any; // sst.aws.CognitoIdentityPool type
}

// REST API resources interface
export interface RestApiResources {
  api: any; // sst.aws.ApiGatewayV2 type
}

// GraphQL API resources interface
export interface GraphQLApiResources {
  graphqlApi: any; // sst.aws.ApiGatewayV2 type
}

// Cron job resources interface
export interface CronJobResources {
  testTaskCron: any; // sst.aws.Cron type
}

// Main infrastructure resources interface
export interface InfrastructureResources {
  linkables: LinkableResources;
  database: DatabaseResources;
  auth: AuthResources;
  restApi: RestApiResources;
  graphqlApi: GraphQLApiResources;
  cronJobs: CronJobResources;
}

// Environment configuration interface
export interface EnvironmentConfig {
  stage: string;
  region: string;
  isProduction: boolean;
}

// Function configuration interface
export interface FunctionConfig {
  handler: string;
  runtime: string;
  link?: any[];
  url?: boolean;
  timeout?: string;
  memory?: string;
}
