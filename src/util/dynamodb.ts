import { getStage } from "./env";

export enum DynamoTable {
  MarketData = "MarketData",
  Reports = "Reports",
}

interface GetDynamoTableNameOptions {
  appName?: string;
  stage?: string;
}

function resolveAppName(): string {
  // Prefer explicit APP_NAME from env; default to project name for convenience
  return process.env.APP_NAME || "kairos-be";
}

export function getDynamoTableName(
  table: DynamoTable,
  options: GetDynamoTableNameOptions = {}
): string {
  const appName = options.appName ?? resolveAppName();
  const stage = options.stage ?? getStage();

  const suffix =
    table === DynamoTable.MarketData ? "MarketDataTable" : "ReportsTable";

  return `${appName}-${stage}-${suffix}`;
}
