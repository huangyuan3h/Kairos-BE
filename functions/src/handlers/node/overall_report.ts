// Lambda handler for generating the daily overall report (Node.js)
// This is a thin wrapper that delegates to the reporting application layer.

import type { GenerateOverallReportInput } from "@src/reporting/application/generate_overall_report";
import { generateOverallReport } from "@src/reporting/application/generate_overall_report";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";

/**
 * AWS Lambda entrypoint.
 * Loads configuration from environment variables and triggers the report generation use case.
 */
export const handler = async () => {
  const marketDataTableName = getDynamoTableName(DynamoTable.MarketData);
  const reportsTableName = getDynamoTableName(DynamoTable.Reports);

  const input: GenerateOverallReportInput = {
    asOfDate: new Date().toISOString().slice(0, 10),
    marketScope: "CN",
    marketDataTableName,
    reportsTableName,
  };

  const result = await generateOverallReport(input);

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "ok", result }),
  };
};
