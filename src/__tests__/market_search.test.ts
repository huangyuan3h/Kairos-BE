import { searchCatalog } from "../market/search_catalog";

// Mock repository class with instance methods
const mockQuery = jest.fn();

jest.mock("../market/db/marketdata_repository", () => {
  return {
    MarketDataRepository: class {
      constructor(_: any) {}
      queryCatalogByMarketFuzzy = mockQuery;
    },
  };
});

describe("searchCatalog business logic", () => {
  beforeEach(() => {
    mockQuery.mockReset();
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
  });

  test("uses default limit when not provided", async () => {
    const tableName = "Dummy";
    mockQuery.mockResolvedValue([]);

    await searchCatalog({
      q: "dev",
      tableName,
    });

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      market: "CN_A",
      q: "dev",
      limit: 5,
    });
  });

  test("passes remaining limit to subsequent partitions", async () => {
    const tableName = "Dummy";
    mockQuery
      .mockResolvedValueOnce([
        { symbol: "CN1", name: "China One" },
        { symbol: "CN2", name: "China Two" },
      ])
      .mockResolvedValueOnce([{ symbol: "US1", name: "US One" }]);

    const out = await searchCatalog({
      q: "dev",
      limit: 3,
      tableName,
    });

    expect(out.count).toBe(3);
    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      market: "CN_A",
      q: "dev",
      limit: 3,
    });
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      market: "US",
      q: "dev",
      limit: 1,
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
