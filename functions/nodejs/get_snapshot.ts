// Lambda handler for fetching latest quote snapshots for one or more symbols.
//
// Endpoint: GET /snapshot
// Query params:
//   - symbols: string (required) multiple codes separated by "|"
// Behavior:
//   - Normalizes and de-duplicates requested symbols.
//   - Looks up the latest data point (and previous close when available) from
//     IndexData first, then StockData.
//   - Returns last price, absolute change, percentage change, and inferred type.
// Env:
//   - INDEX_DATA_TABLE, STOCK_DATA_TABLE are provided by deploy/api/rest.ts
import { getSnapshot } from "@src/market/get_snapshot";

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters ?? {};
    const rawSymbols = typeof qs.symbols === "string" ? qs.symbols : "";
    const symbols = rawSymbols
      .split("|")
      .map((part: string) => part.trim())
      .filter((part: string) => part.length > 0);

    if (symbols.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "symbols is required" }),
      };
    }

    const indexTableName = process.env.INDEX_DATA_TABLE as string | undefined;
    const stockTableName = process.env.STOCK_DATA_TABLE as string | undefined;

    if (!indexTableName || !stockTableName) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "INDEX_DATA_TABLE or STOCK_DATA_TABLE not configured" }),
      };
    }

    const result = await getSnapshot({
      symbols,
      indexTableName,
      stockTableName,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("get_snapshot error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};


