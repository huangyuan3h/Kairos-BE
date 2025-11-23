// Thin wrapper delegating to business layer under src/market
//
// Endpoint: GET /catalog/search
// Purpose:
//   Fuzzy search stock/index/etf catalogs stored in MarketData to support FE autocomplete/search.
// Inputs (query params):
//   - input: string (preferred key from FE). If absent, falls back to q. Required (non-empty after trim).
//   - market: string (optional). When provided (e.g., CN_A, US, INDEX, ETF), restricts search to that
//             market partition using GSI2 (byMarketStatus) for better performance.
//   - limit: not required from FE. The business layer applies defaults and hard caps (default 5, max 50)
//            to control cost. Handler ignores FE-sent limit to keep the API stable and safe.
// Behavior:
//   - Calls src/market/search_catalog.searchCatalog which:
//       1) Normalizes the query; if it looks like a symbol/code (e.g., SH600988, 600988),
//          queries the bySymbol GSI directly for exact hits.
//       2) If more results are needed (or the input looks like a name), iterates partitions
//          [CN_A, US, INDEX, ETF], querying MARKET#<partition>#STATUS#ACTIVE with fuzzy filters
//          and automatic pagination until enough items are collected.
//       3) De-duplicates by symbol and enforces the limit.
// Returns:
//   200 { count, items: [{ symbol, name, exchange, asset_type, market, status }, ...] }
//   400 when input is missing; 500 on internal errors.
// Notes:
//   - DynamoDB contains is case-sensitive; for advanced fuzzy (case-insensitive/prefix/pinyin), consider
//     adding a search-oriented GSI or integrating OpenSearch later.
//   - This handler remains thin by design; business and DB access live under src/market/.
import { searchCatalog } from "@src/market/search_catalog";

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters ?? {};
    // FE 只传一个输入值时，优先取 input，其次兼容 q
    const rawInput = qs.input ?? qs.q;
    const q: string = String(rawInput ?? "").trim();
    const market: string | undefined = qs.market ? String(qs.market).trim() : undefined;
    // 为保持简洁，FE 不需传 limit；业务层内部会使用默认 5 并做 1..50 的边界限制
    const limit = undefined;
    const tableName = process.env.MARKET_DATA_TABLE as string;

    if (!q) {
      return { statusCode: 400, body: JSON.stringify({ error: "q is required" }) };
    }
    if (!tableName) {
      return { statusCode: 500, body: JSON.stringify({ error: "MARKET_DATA_TABLE not configured" }) };
    }

    const out = await searchCatalog({ q, market, limit, tableName });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(out),
    };
  } catch (err) {
    console.error("search_catalog error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};


