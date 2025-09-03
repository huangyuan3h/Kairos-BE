// Lambda handler for getting reports with pagination (Node.js)
// This is a thin wrapper that delegates to the reporting application layer.

import { getReportSummaries } from "../../src/reporting/business/get_report";

/**
 * AWS Lambda entrypoint for getting reports with pagination.
 * Handles query parameters: type, currentPage, pageSize
 */
export const handler = async (event: any) => {
  try {
    // Extract query parameters
    const queryParams = event.queryStringParameters || {};
    const type = queryParams.type || "overall";
    const currentPage = parseInt(queryParams.currentPage || "1", 10);
    const pageSize = parseInt(queryParams.pageSize || "10", 10);

    // Validate parameters
    if (currentPage < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "currentPage must be greater than 0",
        }),
      };
    }

    if (pageSize < 1 || pageSize > 100) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "pageSize must be between 1 and 100",
        }),
      };
    }

    // Call business logic (summaries only, no content)
    const result = await getReportSummaries({
      type,
      currentPage,
      pageSize,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error getting reports:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
