// Lambda handler for generating the daily overall report (Node.js)
// This is a thin wrapper that delegates to the reporting application layer.

import { forceFlushLangfuse } from "@src/ai-agent/telemetry/instrumentation";
import { generateOverallReport } from "@src/reporting/business/generate_overall_report";

/**
 * AWS Lambda entrypoint.
 * Simple hook that delegates to the report generation use case.
 */
export const handler = async () => {
  const result = await generateOverallReport();
  // Ensure spans are exported in short-lived environments (Lambda)
  await forceFlushLangfuse();

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "ok", result }),
  };
};
