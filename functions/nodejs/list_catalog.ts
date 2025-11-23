import { listCatalog, CatalogCursor } from "@src/market/list_catalog";

interface ApiEvent {
  queryStringParameters?: Record<string, string | undefined>;
}

export const handler = async (event: ApiEvent) => {
  try {
    const qs = event.queryStringParameters ?? {};
    const market = (qs.market ?? "").trim();
    const assetType = qs.assetType ? String(qs.assetType).trim() : undefined;
    const q = qs.q ? String(qs.q).trim() : undefined;
    const limit = qs.limit ? Number(qs.limit) : undefined;
    const cursor = qs.cursor ? decodeCursor(qs.cursor) : undefined;

    if (!market) {
      return response(400, { error: "market is required" });
    }

    const tableName = process.env.MARKET_DATA_TABLE;
    const stockTableName = process.env.STOCK_DATA_TABLE;
    const indexTableName = process.env.INDEX_DATA_TABLE;
    if (!tableName || !stockTableName || !indexTableName) {
      return response(500, { error: "catalog tables not configured" });
    }

    const result = await listCatalog({
      market,
      assetType,
      q,
      limit,
      cursor,
      tableName,
      stockTableName,
      indexTableName,
    });

    return response(200, {
      ...result,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : undefined,
    });
  } catch (err) {
    console.error("list_catalog error", err);
    return response(500, { error: "Internal server error" });
  }
};

function decodeCursor(value: string): CatalogCursor | undefined {
  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    const obj = JSON.parse(json);
    return typeof obj === "object" && obj ? obj : undefined;
  } catch {
    return undefined;
  }
}

function encodeCursor(cursor: CatalogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

