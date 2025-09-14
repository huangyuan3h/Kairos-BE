/**
 * Business logic: fetch time series for a code from IndexData or StockData.
 */
import {
  TimeseriesRepository,
  TimeseriesPoint,
} from "./db/timeseries_repository";

export interface GetTimeseriesInput {
  code: string;
  asset?: "index" | "stock";
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  days?: number; // used when from/to not provided
  indexTableName: string;
  stockTableName: string;
}

export interface GetTimeseriesOutput {
  asset: "index" | "stock";
  code: string;
  from: string;
  to: string;
  count: number;
  points: TimeseriesPoint[];
}

export async function getTimeseries(
  input: GetTimeseriesInput
): Promise<GetTimeseriesOutput> {
  const { code } = input;
  const { from, to } = resolveDateRange(
    input.from,
    input.to,
    input.days ?? 120
  );

  if (input.asset === "index") {
    const repo = new TimeseriesRepository({ tableName: input.indexTableName });
    const points = await repo.queryBySymbolDateRange({
      code,
      fromDate: from,
      toDate: to,
    });
    return { asset: "index", code, from, to, count: points.length, points };
  }

  if (input.asset === "stock") {
    const repo = new TimeseriesRepository({ tableName: input.stockTableName });
    const points = await repo.queryBySymbolDateRange({
      code,
      fromDate: from,
      toDate: to,
    });
    return { asset: "stock", code, from, to, count: points.length, points };
  }

  // Auto-detect: try index first, then stock
  {
    const indexRepo = new TimeseriesRepository({
      tableName: input.indexTableName,
    });
    const points = await indexRepo.queryBySymbolDateRange({
      code,
      fromDate: from,
      toDate: to,
    });
    if (points.length > 0) {
      return { asset: "index", code, from, to, count: points.length, points };
    }
  }

  {
    const stockRepo = new TimeseriesRepository({
      tableName: input.stockTableName,
    });
    const points = await stockRepo.queryBySymbolDateRange({
      code,
      fromDate: from,
      toDate: to,
    });
    return { asset: "stock", code, from, to, count: points.length, points };
  }
}

function resolveDateRange(
  from?: string,
  to?: string,
  days: number = 120
): { from: string; to: string } {
  if (from && to) return { from, to };
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - Math.max(0, days - 1));
  return { from: formatDate(start), to: formatDate(end) };
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
