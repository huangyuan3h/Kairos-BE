/**
 * Business logic: fuzzy search over MarketData catalog.
 */
import { MarketDataRepository, CatalogItem } from "./db/marketdata_repository";
import { getLogger } from "@src/util/logger";
import { analyzeSearchInput } from "./search_input";

export interface SearchCatalogInput {
  q: string;
  market?: string; // CN_A | US | INDEX | ETF
  limit?: number;
  tableName: string;
}

export interface SearchCatalogOutput {
  count: number;
  items: CatalogItem[];
}

const DEFAULT_LIMIT = 5;
const DEFAULT_MARKET_PARTITIONS = ["CN_A", "US", "INDEX", "ETF"];
const MARKET_QUERY_MAX_PAGES = 50;
const MARKET_QUERY_PAGE_SIZE = 80;

export async function searchCatalog(
  input: SearchCatalogInput
): Promise<SearchCatalogOutput> {
  const logger = getLogger("market/search_catalog");
  const { q, market, tableName } = input;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 50);
  const repo = new MarketDataRepository({ tableName });

  const collected: CatalogItem[] = [];
  const seen = new Set<string>();
  const parsedInput = analyzeSearchInput(q);

  async function add(items?: CatalogItem[] | null) {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it?.symbol) continue;
      const sym = String(it.symbol);
      if (seen.has(sym)) continue;
      seen.add(sym);
      collected.push(it);
      if (collected.length >= limit) break;
    }
  }

  async function fetchSymbol(candidate: string) {
    const remaining = limit - collected.length;
    if (remaining <= 0) return;
    const part = await repo.queryCatalogBySymbolExact({
      symbol: candidate,
      limit: remaining,
    });
    await add(part);
  }

  async function fetchPartition(targetMarket: string) {
    const remaining = limit - collected.length;
    if (remaining <= 0) return;
    const part = await repo.queryCatalogByMarketFuzzy({
      market: targetMarket,
      q,
      limit: remaining,
      maxPages: MARKET_QUERY_MAX_PAGES,
      pageSize: Math.max(MARKET_QUERY_PAGE_SIZE, remaining * 5),
    });
    await add(part);
  }

  if (parsedInput.symbolCandidates.length > 0) {
    for (const candidate of parsedInput.symbolCandidates) {
      try {
        await fetchSymbol(candidate);
      } catch (err) {
        logger.warn(
          { err, symbol: candidate },
          "queryCatalogBySymbolExact failed for symbol candidate"
        );
      }
      if (collected.length >= limit) break;
    }
  }

  if (parsedInput.isSymbolLike && collected.length > 0) {
    return { count: collected.length, items: collected };
  }

  if (collected.length >= limit) {
    return { count: collected.length, items: collected };
  }

  if (market) {
    try {
      await fetchPartition(market);
    } catch (err) {
      // If GSI query fails, continue with best-effort empty result for this partition
      logger.warn(
        { err },
        "queryCatalogByMarketFuzzy failed for requested market"
      );
    }
  } else {
    for (const mk of DEFAULT_MARKET_PARTITIONS) {
      if (collected.length >= limit) break;
      try {
        await fetchPartition(mk);
      } catch (err) {
        // Skip partition on error and continue with remaining partitions
        logger.warn(
          { err, market: mk },
          "queryCatalogByMarketFuzzy failed for market partition"
        );
      }
    }
  }

  return { count: collected.length, items: collected };
}
