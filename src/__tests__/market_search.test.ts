import { searchCatalog } from "../market/search_catalog";

// Mock repository class with instance methods
const mockQuery = jest.fn();
const mockScan = jest.fn();

jest.mock("../market/db/marketdata_repository", () => {
  return {
    MarketDataRepository: class {
      constructor(_: any) {}
      queryCatalogByMarketFuzzy = mockQuery;
      scanCatalogFuzzy = mockScan;
    },
  };
});

describe("searchCatalog business logic", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockScan.mockReset();
  });

  test("merges and dedups results, respects limit when market specified", async () => {
    const tableName = "Dummy";
    mockQuery.mockResolvedValueOnce([
      { symbol: "SH600000", name: "Pudong Dev" },
      { symbol: "SH600001", name: "A Corp" },
      { symbol: "SH600000", name: "Pudong Dev" }, // duplicate
    ]);

    const out = await searchCatalog({
      q: "dev",
      market: "CN_A",
      limit: 2,
      tableName,
    });
    expect(out.count).toBe(2);
    expect(out.items.map(i => i.symbol)).toEqual(["SH600000", "SH600001"]);
    expect(mockScan).not.toHaveBeenCalled();
  });

  test("falls back to scan when partitions return empty", async () => {
    const tableName = "Dummy";
    // partitions queries (CN_A/US/INDEX/ETF) all return empty
    mockQuery.mockResolvedValue([]);
    mockScan.mockResolvedValue([
      { symbol: "US:AAPL", name: "Apple Inc." },
      { symbol: "US:MSFT", name: "Microsoft" },
    ]);

    const out = await searchCatalog({ q: "pp", limit: 5, tableName });
    expect(out.count).toBe(2);
    expect(out.items[0].symbol).toBe("US:AAPL");
    expect(mockScan).toHaveBeenCalledTimes(1);
  });
});
