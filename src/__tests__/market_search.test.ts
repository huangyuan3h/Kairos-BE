import { searchCatalog } from "../market/search_catalog";

const mockQueryByMarket = jest.fn();
const mockQueryBySymbol = jest.fn();

jest.mock("../market/db/marketdata_repository", () => {
  return {
    MarketDataRepository: class {
      constructor(_: any) {}
      queryCatalogByMarketFuzzy = mockQueryByMarket;
      queryCatalogBySymbolExact = mockQueryBySymbol;
    },
  };
});

describe("searchCatalog business logic", () => {
  beforeEach(() => {
    mockQueryByMarket.mockReset();
    mockQueryBySymbol.mockReset();
  });

  test("merges and dedups results, respects limit when market specified", async () => {
    const tableName = "Dummy";
    mockQueryByMarket.mockResolvedValueOnce([
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
    mockQueryByMarket.mockResolvedValue([]);

    await searchCatalog({
      q: "dev",
      tableName,
    });

    expect(mockQueryByMarket).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        market: "CN_A",
        q: "dev",
        limit: 5,
        maxPages: 50,
        pageSize: 80,
      })
    );
  });

  test("passes remaining limit to subsequent partitions", async () => {
    const tableName = "Dummy";
    mockQueryByMarket
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
    expect(mockQueryByMarket).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        market: "CN_A",
        q: "dev",
        limit: 3,
        maxPages: 50,
        pageSize: 80,
      })
    );
    expect(mockQueryByMarket).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        market: "US",
        q: "dev",
        limit: 1,
        maxPages: 50,
        pageSize: 80,
      })
    );
    expect(mockQueryByMarket).toHaveBeenCalledTimes(2);
  });

  test("prefers symbol search when digits provided", async () => {
    const tableName = "Dummy";
    mockQueryBySymbol.mockResolvedValueOnce([
      { symbol: "SH600988", name: "China Railway" },
    ]);
    const out = await searchCatalog({
      q: "600988",
      tableName,
    });
    expect(out.items.map(i => i.symbol)).toEqual(["SH600988"]);
    expect(mockQueryBySymbol).toHaveBeenCalledWith({
      symbol: "600988",
      limit: 5,
    });
    expect(mockQueryByMarket).not.toHaveBeenCalled();
  });

  test("falls back to market search when symbol search empty", async () => {
    const tableName = "Dummy";
    mockQueryBySymbol.mockResolvedValue([]);
    mockQueryByMarket.mockResolvedValueOnce([
      { symbol: "SH600988", name: "China Railway" },
    ]);

    const out = await searchCatalog({
      q: "sh600988",
      tableName,
    });

    expect(out.count).toBe(1);
    expect(mockQueryBySymbol).toHaveBeenCalled();
    expect(mockQueryByMarket).toHaveBeenCalled();
  });
});
