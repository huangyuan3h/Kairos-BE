import { MarketDataRepository, CatalogItem } from "./db/marketdata_repository";
import {
  TimeseriesRepository,
  TimeseriesPoint,
} from "./db/timeseries_repository";
import { analyzeSearchInput } from "./search_input";
import { getLogger } from "@src/util/logger";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type CatalogCursor = Record<string, unknown>;

export interface ListCatalogInput {
  market: string;
  assetType?: string;
  q?: string;
  limit?: number;
  cursor?: CatalogCursor;
  tableName: string;
  stockTableName: string;
  indexTableName: string;
}

export interface CatalogListItem extends CatalogItem {
  last?: number | null;
  change?: number | null;
  changePercent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  asOfDate?: string | null;
}

export interface ListCatalogOutput {
  count: number;
  items: CatalogListItem[];
  nextCursor?: CatalogCursor;
}

interface CatalogRepository {
  queryCatalogBySymbolExact(params: {
    symbol: string;
    limit: number;
  }): Promise<CatalogItem[]>;
  queryCatalogPage(params: {
    market: string;
    limit: number;
    cursor?: CatalogCursor;
    assetType?: string;
    q?: string;
  }): Promise<{ items: CatalogItem[]; cursor?: CatalogCursor }>;
}

interface QuoteRepository {
  queryLatestBySymbol(params: {
    code: string;
    limit?: number;
  }): Promise<TimeseriesPoint[]>;
}

export interface ListCatalogDependencies {
  catalogRepository?: CatalogRepository;
  stockRepository?: QuoteRepository;
  indexRepository?: QuoteRepository;
}

export async function listCatalog(
  input: ListCatalogInput,
  deps: ListCatalogDependencies = {}
): Promise<ListCatalogOutput> {
  const logger = getLogger("market/list_catalog");
  if (!input.market) {
    throw new Error("market is required");
  }
  const limit = clampLimit(input.limit);
  const repo =
    deps.catalogRepository ??
    new MarketDataRepository({ tableName: input.tableName });
  const parsed = input.q ? analyzeSearchInput(input.q) : undefined;

  const collected: CatalogItem[] = [];
  const seen = new Set<string>();

  async function add(items?: CatalogItem[] | null) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item?.symbol) continue;
      if (!passesFilters(item, input)) continue;
      const sym = String(item.symbol);
      if (seen.has(sym)) continue;
      seen.add(sym);
      collected.push(item);
      if (collected.length >= limit) break;
    }
  }

  if (parsed?.isSymbolLike && parsed.symbolCandidates.length > 0) {
    for (const candidate of parsed.symbolCandidates) {
      try {
        await add(
          await repo.queryCatalogBySymbolExact({
            symbol: candidate,
            limit,
          })
        );
      } catch (err) {
        logger.warn({ err, symbol: candidate }, "symbol lookup failed");
      }
      if (collected.length >= limit) break;
    }
    if (collected.length > 0) {
      const enriched = await enrichItems(collected, input, deps);
      return { count: enriched.length, items: enriched };
    }
  }

  const page = await repo.queryCatalogPage({
    market: input.market,
    limit,
    cursor: input.cursor,
    assetType: input.assetType,
    q: input.q,
  });
  await add(page.items);
  const enriched = await enrichItems(collected, input, deps);

  return {
    count: enriched.length,
    items: enriched,
    nextCursor: page.cursor,
  };
}

async function enrichItems(
  items: CatalogItem[],
  input: ListCatalogInput,
  deps: ListCatalogDependencies
): Promise<CatalogListItem[]> {
  if (items.length === 0) return [];
  const stockRepo =
    deps.stockRepository ??
    new TimeseriesRepository({ tableName: input.stockTableName });
  const indexRepo =
    deps.indexRepository ??
    new TimeseriesRepository({ tableName: input.indexTableName });

  return Promise.all(
    items.map(async item => {
      const quote = await fetchQuote(item, stockRepo, indexRepo);
      return {
        ...item,
        ...quote,
      };
    })
  );
}

async function fetchQuote(
  item: CatalogItem,
  stockRepo: QuoteRepository,
  indexRepo: QuoteRepository
): Promise<Omit<CatalogListItem, keyof CatalogItem>> {
  const targetRepo =
    resolveQuoteRepo(item.asset_type) === "index" ? indexRepo : stockRepo;
  try {
    const points = await targetRepo.queryLatestBySymbol({
      code: String(item.symbol),
      limit: 2,
    });
    return deriveQuote(points);
  } catch {
    return emptyQuote();
  }
}

function deriveQuote(
  points: TimeseriesPoint[]
): Omit<CatalogListItem, keyof CatalogItem> {
  const latest = points?.[0];
  if (!latest) return emptyQuote();
  const prev = points?.[1];
  const last = pickNumber(
    latest.close ??
      latest["adj_close"] ??
      latest["last"] ??
      latest["price"] ??
      latest["close_price"]
  );
  const prevClose =
    pickNumber(
      latest["prev_close"] ?? latest["previous_close"] ?? latest["prior_close"]
    ) ??
    (prev
      ? pickNumber(
          prev.close ??
            prev["adj_close"] ??
            prev["last"] ??
            prev["price"] ??
            prev["close_price"]
        )
      : null);
  const change =
    last != null && prevClose != null ? roundTo(last - prevClose, 6) : null;
  const changePercent =
    change != null && prevClose != null && prevClose !== 0
      ? roundTo((change / prevClose) * 100, 6)
      : null;

  return {
    last: last != null ? roundTo(last, 6) : null,
    change,
    changePercent,
    open: pickNumber(latest.open) ?? null,
    high: pickNumber(latest.high) ?? null,
    low: pickNumber(latest.low) ?? null,
    close: pickNumber(latest.close) ?? null,
    volume: pickNumber(latest.volume) ?? null,
    asOfDate: latest.date ?? latest["as_of_date"] ?? null,
  };
}

function emptyQuote(): Omit<CatalogListItem, keyof CatalogItem> {
  return {
    last: null,
    change: null,
    changePercent: null,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    asOfDate: null,
  };
}

function resolveQuoteRepo(value?: string): "index" | "stock" {
  if (!value) return "stock";
  const norm = value.toLowerCase();
  if (norm === "index" || norm === "etf") return "index";
  return "stock";
}

function clampLimit(value?: number): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_LIMIT);
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function passesFilters(item: CatalogItem, input: ListCatalogInput): boolean {
  if (input.market && item.market && item.market !== input.market) {
    return false;
  }
  if (input.assetType) {
    const desired = input.assetType.toLowerCase();
    const actual = (item.asset_type ?? "").toLowerCase();
    if (!actual || actual !== desired) {
      return false;
    }
  }
  return true;
}
