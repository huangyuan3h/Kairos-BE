/**
 * Business logic: fetch quote snapshots for requested symbols.
 */
import {
  TimeseriesRepository,
  TimeseriesPoint,
} from "./db/timeseries_repository";
import { getLogger } from "@src/util/logger";

export type SnapshotType = "index" | "stock" | "unknown";

export interface GetSnapshotInput {
  symbols: string[];
  indexTableName: string;
  stockTableName: string;
}

export interface SnapshotItem {
  symbol: string;
  type: SnapshotType;
  last: number | null;
  chg: number | null;
  chgPercent: number | null;
}

export interface GetSnapshotOutput {
  count: number;
  items: SnapshotItem[];
}

interface SnapshotRepository {
  queryLatestBySymbol(params: {
    code: string;
    limit?: number;
  }): Promise<TimeseriesPoint[]>;
}

export interface GetSnapshotDependencies {
  indexRepository?: SnapshotRepository;
  stockRepository?: SnapshotRepository;
}

export async function getSnapshot(
  input: GetSnapshotInput,
  deps: GetSnapshotDependencies = {}
): Promise<GetSnapshotOutput> {
  const logger = getLogger("market/get_snapshot");
  const normalized = normalizeSymbols(input.symbols);

  if (normalized.length === 0) {
    return { count: 0, items: [] };
  }

  const indexRepo =
    deps.indexRepository ??
    new TimeseriesRepository({ tableName: input.indexTableName });
  const stockRepo =
    deps.stockRepository ??
    new TimeseriesRepository({ tableName: input.stockTableName });

  const items = await Promise.all(
    normalized.map(async symbol => {
      const indexPoints = await safeQuery(indexRepo, symbol);
      if (indexPoints.length > 0) {
        logger.debug(
          { symbol, asset: "index", latestDate: indexPoints[0]?.date },
          "snapshot index match"
        );
        return buildSnapshot(symbol, "index", indexPoints);
      }

      const stockPoints = await safeQuery(stockRepo, symbol);
      if (stockPoints.length > 0) {
        logger.debug(
          { symbol, asset: "stock", latestDate: stockPoints[0]?.date },
          "snapshot stock match"
        );
        return buildSnapshot(symbol, "stock", stockPoints);
      }

      logger.debug({ symbol }, "snapshot no data");
      return {
        symbol,
        type: "unknown" as SnapshotType,
        last: null,
        chg: null,
        chgPercent: null,
      };
    })
  );

  return { count: items.length, items };
}

async function safeQuery(
  repo: SnapshotRepository,
  symbol: string
): Promise<TimeseriesPoint[]> {
  try {
    return await repo.queryLatestBySymbol({ code: symbol, limit: 2 });
  } catch (err) {
    const logger = getLogger("market/get_snapshot");
    logger.error({ symbol, err }, "snapshot query failed");
    return [];
  }
}

function buildSnapshot(
  symbol: string,
  type: Exclude<SnapshotType, "unknown">,
  points: TimeseriesPoint[]
): SnapshotItem {
  const latest = points[0];
  if (!latest) {
    return { symbol, type, last: null, chg: null, chgPercent: null };
  }

  const last = pickNumber(
    latest.close ?? latest["adj_close"] ?? latest["last"] ?? latest["price"]
  );
  const prev = resolvePreviousClose(latest, points[1]);
  const chg = last != null && prev != null ? roundTo(last - prev, 6) : null;
  const chgPercent =
    chg != null && prev != null && prev !== 0
      ? roundTo((chg / prev) * 100, 6)
      : null;

  return {
    symbol,
    type,
    last: last != null ? roundTo(last, 6) : null,
    chg,
    chgPercent,
  };
}

function resolvePreviousClose(
  latest: TimeseriesPoint,
  previous?: TimeseriesPoint
): number | null {
  const direct = pickNumber(
    latest["prev_close"] ?? latest["previous_close"] ?? latest["prior_close"]
  );
  if (direct != null) return direct;
  if (previous) {
    return pickNumber(
      previous.close ??
        previous["adj_close"] ??
        previous["last"] ??
        previous["price"]
    );
  }
  return null;
}

function normalizeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of symbols) {
    const norm = String(raw || "")
      .trim()
      .toUpperCase();
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    ordered.push(norm);
  }
  return ordered;
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
