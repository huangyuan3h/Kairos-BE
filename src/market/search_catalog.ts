/**
 * Business logic: fuzzy search over MarketData catalog.
 */
import { MarketDataRepository, CatalogItem } from "./db/marketdata_repository";
import { getLogger } from "@src/util/logger";

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

export async function searchCatalog(
  input: SearchCatalogInput
): Promise<SearchCatalogOutput> {
  const logger = getLogger("market/search_catalog");
  const { q, market, tableName } = input;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 50);
  const repo = new MarketDataRepository({ tableName });

  const collected: CatalogItem[] = [];
  const seen = new Set<string>();

  async function add(items: CatalogItem[]) {
    for (const it of items) {
      if (!it?.symbol) continue;
      const sym = String(it.symbol);
      if (seen.has(sym)) continue;
      seen.add(sym);
      collected.push(it);
      if (collected.length >= limit) break;
    }
  }

  async function fetchPartition(targetMarket: string) {
    const remaining = limit - collected.length;
    if (remaining <= 0) return;
    const part = await repo.queryCatalogByMarketFuzzy({
      market: targetMarket,
      q,
      limit: remaining,
    });
    await add(part);
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
    const partitions = ["CN_A", "US", "INDEX", "ETF"];
    for (const mk of partitions) {
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
