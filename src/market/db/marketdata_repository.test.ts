import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { MarketDataRepository } from "./marketdata_repository";

const mockSend = jest.fn();

function createRepo() {
  const client = { send: mockSend } as unknown as DynamoDBDocumentClient;
  return new MarketDataRepository({ tableName: "Dummy", client });
}

describe("MarketDataRepository", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("queryCatalogBySymbolExact uses bySymbol index", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ symbol: "SH600988", name: "China Railway" }],
    });
    const repo = createRepo();
    const items = await repo.queryCatalogBySymbolExact({
      symbol: "sh600988",
      limit: 2,
    });
    const sent = mockSend.mock.calls[0]?.[0] as { input: Record<string, any> };
    expect(sent.input.IndexName).toBe("bySymbol");
    expect(sent.input.ExpressionAttributeValues).toEqual({
      ":pk": "SYMBOL#SH600988",
      ":entity": "ENTITY#CATALOG",
    });
    expect(items[0]?.symbol).toBe("SH600988");
  });

  test("paginates until limit is satisfied or no cursor remains", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: { pk: "STOCK#1", sk: "META#CATALOG" },
      })
      .mockResolvedValueOnce({
        Items: [{ symbol: "CN1", name: "China One" }],
      });

    const repo = createRepo();
    const items = await repo.queryCatalogByMarketFuzzy({
      market: "CN_A",
      q: "c",
      limit: 1,
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.symbol).toBe("CN1");
  });

  test("queryCatalogByMarketFuzzy clamps max pages to configured maximum", async () => {
    mockSend.mockImplementation(() => ({
      Items: [],
      LastEvaluatedKey: { pk: "STOCK#MORE", sk: "META#CATALOG" },
    }));

    const repo = createRepo();
    await repo.queryCatalogByMarketFuzzy({
      market: "US",
      q: "alpha",
      limit: 1,
      maxPages: 999,
    });

    expect(mockSend).toHaveBeenCalledTimes(20);
  });

  test("queryCatalogPage returns cursor and respects optional filters", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ symbol: "US1", name: "US Stock" }],
      LastEvaluatedKey: { pk: "STOCK#US1", sk: "META#CATALOG" },
    });

    const repo = createRepo();
    const result = await repo.queryCatalogPage({
      market: "US",
      limit: 5,
      assetType: "stock",
      q: "us",
    });

    const sent = mockSend.mock.calls[0]?.[0] as { input: Record<string, any> };
    expect(sent.input.FilterExpression).toContain("#asset_type = :assetType");
    expect(sent.input.ExpressionAttributeValues[":assetType"]).toBe("stock");
    expect(sent.input.ExpressionAttributeValues[":q"]).toBe("us");
    expect(result.items).toHaveLength(1);
    expect(result.cursor).toEqual({ pk: "STOCK#US1", sk: "META#CATALOG" });
  });

  test("queryCatalogPage forwards cursor and clamps limit", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ symbol: "ETF1", name: "ETF One" }],
    });
    const repo = createRepo();
    await repo.queryCatalogPage({
      market: "ETF",
      limit: 200,
      cursor: { pk: "STOCK#OLD", sk: "META#CATALOG" },
    });
    const sent = mockSend.mock.calls[0]?.[0] as { input: Record<string, any> };
    expect(sent.input.Limit).toBe(50);
    expect(sent.input.ExclusiveStartKey).toEqual({
      pk: "STOCK#OLD",
      sk: "META#CATALOG",
    });
  });
});
