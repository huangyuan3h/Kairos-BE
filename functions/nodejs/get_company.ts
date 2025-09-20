// Lambda handler for querying a company record by code.
//
// Endpoint: GET /company
// Inputs (query params):
//   - code: string (required)
// Env:
//   - COMPANY_TABLE is injected from deploy/api/rest.ts
import { getCompany } from "@src/market/get_company";

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters ?? {};
    const code: string = String(qs.code ?? "").trim();

    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: "code is required" }) };
    }

    const companyTableName = process.env.COMPANY_TABLE as string | undefined;
    if (!companyTableName) {
      return { statusCode: 500, body: JSON.stringify({ error: "COMPANY_TABLE not configured" }) };
    }

    const result = await getCompany({ code, companyTableName });

    if (!result) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "company not found", code }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("get_company error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};


