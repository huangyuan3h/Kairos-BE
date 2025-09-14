// Lambda handler for querying time series data for a code over a date window.
//
// Endpoint: GET /timeseries
// Inputs (query params):
//   - code: string (required)
//   - asset: optional ("index" | "stock"); when omitted, handler will try index then stock
//   - from: optional (YYYY-MM-DD)
//   - to: optional (YYYY-MM-DD)
//   - days: optional number (used if from/to are not provided; default 120)
// Behavior:
//   - Chooses IndexData or StockData table based on asset. If asset is missing, auto-detect by trying index first.
//   - Returns normalized points with at least { date, open, high, low, close, volume } where available.
// Env:
//   - INDEX_DATA_TABLE, STOCK_DATA_TABLE are injected from deploy/api/rest.ts
import { getTimeseries } from "@src/market/get_timeseries";

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters ?? {};
    const code: string = String(qs.code ?? "").trim();
    const asset = qs.asset === "index" || qs.asset === "stock" ? (qs.asset as "index" | "stock") : undefined;
    const from = qs.from ? String(qs.from) : undefined;
    const to = qs.to ? String(qs.to) : undefined;
    const days = qs.days ? Number(qs.days) : undefined;

    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: "code is required" }) };
    }

    const indexTableName = process.env.INDEX_DATA_TABLE as string | undefined;
    const stockTableName = process.env.STOCK_DATA_TABLE as string | undefined;
    if (!indexTableName || !stockTableName) {
      return { statusCode: 500, body: JSON.stringify({ error: "INDEX_DATA_TABLE or STOCK_DATA_TABLE not configured" }) };
    }

    const result = await getTimeseries({ code, asset, from, to, days, indexTableName, stockTableName });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("get_timeseries error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};


