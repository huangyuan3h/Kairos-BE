import { listCatalog } from "../market/list_catalog";

const mockCatalogRepo = () => {
  return {
    queryCatalogBySymbolExact: jest.fn(),
    queryCatalogPage: jest.fn(),
  };
};

const mockQuoteRepo = () => ({
  queryLatestBySymbol: jest.fn(),
});

describe("listCatalog", () => {
  const baseInput = {
    market: "CN_A",
    tableName: "Market",
    stockTableName: "Stock",
    indexTableName: "Index",
  };

  test("returns symbol search results when query looks like code", async () => {
    const catalogRepo = mockCatalogRepo();
    catalogRepo.queryCatalogBySymbolExact.mockResolvedValue([
      { symbol: "SH600988", name: "China Railway", asset_type: "stock" },
    ]);
    const stockRepo = mockQuoteRepo();
    stockRepo.queryLatestBySymbol.mockResolvedValue([
      { close: 10, date: "2024-11-05" },
      { close: 9, date: "2024-11-04" },
    ]);

    const out = await listCatalog(
      { ...baseInput, q: "600988" },
      {
        catalogRepository: catalogRepo,
        stockRepository: stockRepo,
      }
    );

    expect(out.count).toBe(1);
    expect(out.items[0].symbol).toBe("SH600988");
    expect(out.items[0].last).toBe(10);
    expect(out.items[0].change).toBe(1);
    expect(catalogRepo.queryCatalogPage).not.toHaveBeenCalled();
  });

  test("falls back to paginated listing with cursor", async () => {
    const catalogRepo = mockCatalogRepo();
    catalogRepo.queryCatalogBySymbolExact.mockResolvedValue([]);
    catalogRepo.queryCatalogPage.mockResolvedValue({
      items: [
        {
          symbol: "CN1",
          name: "China One",
          asset_type: "stock",
          market: "CN_A",
        },
      ],
      cursor: { pk: "STOCK#CN1", sk: "META#CATALOG" },
    });
    const stockRepo = mockQuoteRepo();
    stockRepo.queryLatestBySymbol.mockResolvedValue([
      { close: 5, prev_close: 4.5, date: "2024-11-05" },
    ]);

    const out = await listCatalog(
      { ...baseInput, limit: 10 },
      {
        catalogRepository: catalogRepo,
        stockRepository: stockRepo,
      }
    );

    expect(out.count).toBe(1);
    expect(out.nextCursor).toEqual({ pk: "STOCK#CN1", sk: "META#CATALOG" });
    expect(out.items[0].changePercent).toBeCloseTo(((5 - 4.5) / 4.5) * 100, 5);
    expect(catalogRepo.queryCatalogPage).toHaveBeenCalledWith(
      expect.objectContaining({ market: "CN_A", limit: 10 })
    );
  });
});
