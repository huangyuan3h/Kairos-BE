// Lambda handler for getting a single report by ID (includes content)
// Thin wrapper delegating to the reporting application layer.

import { getReportById } from "../../src/reporting/business/get_report";

export const handler = async (event: any) => {
  try {
    const pathParams = event.pathParameters || {};
    const rawId = pathParams.id;
    if (!rawId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "id is required" }),
      };
    }

    // Normalize potential double-encoding from clients (e.g., REPORT%2523...)
    let id = decodeURIComponent(String(rawId));
    try {
      // If still contains encoded sequences, decode one more time
      if (/%[0-9A-Fa-f]{2}/.test(id)) {
        id = decodeURIComponent(id);
      }
    } catch {}

    const queryParams = event.queryStringParameters || {};
    const type = queryParams.type || "overall";

    const report = await getReportById({ type, reportId: id });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET",
      },
      body: JSON.stringify(report),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = message.includes("Report not found") ? 404 : 500;
    return {
      statusCode,
      body: JSON.stringify({
        error: statusCode === 404 ? "Not Found" : "Internal server error",
        message,
      }),
    };
  }
};
