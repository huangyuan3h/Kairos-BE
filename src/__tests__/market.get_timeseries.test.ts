import { getTimeseries } from "@src/market/get_timeseries";
import * as repoMockModule from "@src/market/db/timeseries_repository";

// Mock the repository to avoid AWS calls and capture inputs
jest.mock("@src/market/db/timeseries_repository", () => {
  const instances: any[] = [];
  const nextResults: any[][] = [];
  class TimeseriesRepository {
    tableName: string;
    lastArgs: any | undefined;
    instanceIndex: number;
    constructor(opts: any) {
      this.tableName = opts.tableName;
      this.instanceIndex = instances.length;
      instances.push(this);
    }
    async queryBySymbolDateRange(args: any) {
      this.lastArgs = args;
      return nextResults[this.instanceIndex] ?? [];
    }
    async queryLatestBySymbol(_args: any) {
      // For tests that probe latest, return empty by default so fallback proceeds
      return [];
    }
  }
  return {
    TimeseriesRepository,
    __setNextResults: (arrs: any[][]) => {
      nextResults.length = 0;
      for (const a of arrs) nextResults.push(a);
    },
    __getInstances: () => instances,
    __reset: () => {
      instances.length = 0;
      nextResults.length = 0;
    },
  };
});

// Helpers to control mock behavior
type RepoMockHelpers = {
  __setNextResults: (arrs: any[][]) => void;
  __getInstances: () => any[];
  __reset: () => void;
};
const repoMock = repoMockModule as unknown as RepoMockHelpers;

describe("getTimeseries business logic", () => {
  const indexTableName = "App-dev-IndexDataTable";
  const stockTableName = "App-dev-StockDataTable";

  beforeEach(() => {
    jest.clearAllMocks();
    repoMock.__reset();
    jest.useRealTimers();
  });

  it("uses index table when asset=index", async () => {
    repoMock.__setNextResults([[{ date: "2024-01-01" }]]);
    const out = await getTimeseries({
      code: "AAPL",
      asset: "index",
      indexTableName,
      stockTableName,
      from: "2024-01-01",
      to: "2024-01-31",
    });
    expect(out.asset).toBe("index");
    expect(out.count).toBe(1);
    const instances = repoMock.__getInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].tableName).toBe(indexTableName);
    expect(instances[0].lastArgs).toMatchObject({
      code: "AAPL",
      fromDate: "2024-01-01",
      toDate: "2024-01-31",
    });
  });

  it("uses stock table when asset=stock", async () => {
    repoMock.__setNextResults([[{ date: "2024-01-02" }]]);
    const out = await getTimeseries({
      code: "MSFT",
      asset: "stock",
      indexTableName,
      stockTableName,
      from: "2024-02-01",
      to: "2024-02-15",
    });
    expect(out.asset).toBe("stock");
    expect(out.count).toBe(1);
    const instances = repoMock.__getInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].tableName).toBe(stockTableName);
    expect(instances[0].lastArgs).toMatchObject({
      code: "MSFT",
      fromDate: "2024-02-01",
      toDate: "2024-02-15",
    });
  });

  it("auto-detects: tries index then falls back to stock", async () => {
    repoMock.__setNextResults([[], [{ date: "2024-03-05" }]]);
    const out = await getTimeseries({
      code: "000001.SZ",
      indexTableName,
      stockTableName,
      from: "2024-03-01",
      to: "2024-03-10",
    });
    expect(out.asset).toBe("stock");
    expect(out.count).toBe(1);
    const instances = repoMock.__getInstances();
    expect(instances).toHaveLength(2);
    expect(instances[0].tableName).toBe(indexTableName);
    expect(instances[1].tableName).toBe(stockTableName);
  });

  it("computes default date range using 'days' when from/to omitted", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-31T00:00:00Z"));
    repoMock.__setNextResults([[{ date: "2024-01-30" }]]);
    const out = await getTimeseries({
      code: "SPY",
      asset: "index",
      indexTableName,
      stockTableName,
      days: 3,
    });
    expect(out.from).toBe("2024-01-29");
    expect(out.to).toBe("2024-01-31");
    const instances = repoMock.__getInstances();
    expect(instances[0].lastArgs).toMatchObject({
      fromDate: "2024-01-29",
      toDate: "2024-01-31",
    });
  });
});
