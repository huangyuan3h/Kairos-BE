import {
  getSnapshot,
  SnapshotItem,
  SnapshotType,
} from "@src/market/get_snapshot";
import { TimeseriesPoint } from "@src/market/db/timeseries_repository";

interface StubRepository {
  queryLatestBySymbol: jest.Mock<
    Promise<TimeseriesPoint[]>,
    [{ code: string; limit?: number }]
  >;
}

function createRepoStub(
  map: Record<string, TimeseriesPoint[]>
): StubRepository {
  return {
    queryLatestBySymbol: jest.fn(async ({ code }) => map[code] ?? []),
  };
}

describe("getSnapshot", () => {
  it("prefers index data and computes change metrics", async () => {
    const indexRepo = createRepoStub({
      "US:SPY": [
        {
          date: "2024-09-10",
          close: 555.12,
          prev_close: 550.0,
        } as TimeseriesPoint,
      ],
    });
    const stockRepo = createRepoStub({});

    const result = await getSnapshot(
      {
        symbols: ["us:spy"],
        indexTableName: "INDEX",
        stockTableName: "STOCK",
      },
      { indexRepository: indexRepo, stockRepository: stockRepo }
    );

    expect(result.count).toBe(1);
    expect(indexRepo.queryLatestBySymbol).toHaveBeenCalledWith({
      code: "US:SPY",
      limit: 2,
    });
    expect(stockRepo.queryLatestBySymbol).not.toHaveBeenCalled();
    const item = result.items[0];
    expect(item.symbol).toBe("US:SPY");
    expect(item.type).toBe("index");
    expect(item.last).toBeCloseTo(555.12, 5);
    expect(item.chg).toBeCloseTo(5.12, 5);
    expect(item.chgPercent).toBeCloseTo((5.12 / 550) * 100, 5);
  });

  it("falls back to stock data when index has no points", async () => {
    const indexRepo = createRepoStub({
      BABA: [],
    });
    const stockRepo = createRepoStub({
      BABA: [
        { date: "2024-09-09", close: 80.5 },
        { date: "2024-09-06", close: 79.0 },
      ] as TimeseriesPoint[],
    });

    const result = await getSnapshot(
      {
        symbols: ["BABA"],
        indexTableName: "INDEX",
        stockTableName: "STOCK",
      },
      { indexRepository: indexRepo, stockRepository: stockRepo }
    );

    expect(result.count).toBe(1);
    expect(indexRepo.queryLatestBySymbol).toHaveBeenCalledWith({
      code: "BABA",
      limit: 2,
    });
    expect(stockRepo.queryLatestBySymbol).toHaveBeenCalledWith({
      code: "BABA",
      limit: 2,
    });
    const item = result.items[0];
    expect(item.type).toBe("stock");
    expect(item.last).toBeCloseTo(80.5, 5);
    expect(item.chg).toBeCloseTo(1.5, 5);
    expect(item.chgPercent).toBeCloseTo((1.5 / 79) * 100, 5);
  });

  it("returns unknown snapshot when no data exists and removes duplicates", async () => {
    const indexRepo = createRepoStub({});
    const stockRepo = createRepoStub({});

    const result = await getSnapshot(
      {
        symbols: ["  foo  ", "foo"],
        indexTableName: "INDEX",
        stockTableName: "STOCK",
      },
      { indexRepository: indexRepo, stockRepository: stockRepo }
    );

    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({
      symbol: "FOO",
      type: "unknown" as SnapshotType,
      last: null,
      chg: null,
      chgPercent: null,
    } satisfies SnapshotItem);
  });
});
