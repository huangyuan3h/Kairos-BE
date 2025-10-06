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
});
