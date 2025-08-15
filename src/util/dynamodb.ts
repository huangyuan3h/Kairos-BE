import { getStage } from "./env";

export enum DynamoTable {
  MarketData = "MarketData",
  Reports = "Reports",
}

interface GetDynamoTableNameOptions {
  stage?: string;
}

// App name as constant
const APP_NAME = "kairos-be";

export function getDynamoTableName(
  table: DynamoTable,
  options: GetDynamoTableNameOptions = {}
): string {
  const stage = options.stage ?? getStage();

  const suffix =
    table === DynamoTable.MarketData ? "MarketDataTable" : "ReportsTable";

  return `${APP_NAME}-${stage}-${suffix}`;
}
