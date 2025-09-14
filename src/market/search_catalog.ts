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

export async function searchCatalog(
  input: SearchCatalogInput
): Promise<SearchCatalogOutput> {
  const logger = getLogger("market/search_catalog");
  const { q, market, tableName } = input;
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
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

  if (market) {
    try {
      const part = await repo.queryCatalogByMarketFuzzy({ market, q, limit });
      await add(part);
    } catch (err) {
      // If GSI is missing or query fails, fall back to bounded Scan
      logger.warn(
        { err },
        "queryCatalogByMarketFuzzy failed; falling back to Scan"
      );
    }
  } else {
    const partitions = ["CN_A", "US", "INDEX", "ETF"];
    for (const mk of partitions) {
      if (collected.length >= limit) break;
      try {
        const part = await repo.queryCatalogByMarketFuzzy({
          market: mk,
          q,
          limit,
        });
        await add(part);
      } catch (err) {
        // Skip partition on error; a later Scan will still provide best-effort results
        logger.warn(
          { err, market: mk },
          "queryCatalogByMarketFuzzy failed for market partition"
        );
      }
    }
  }

  if (collected.length === 0) {
    const scanned = await repo.scanCatalogFuzzy({ q, limit });
    await add(scanned);
  }

  return { count: collected.length, items: collected };
}
