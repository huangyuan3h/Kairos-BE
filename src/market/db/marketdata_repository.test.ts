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
});
