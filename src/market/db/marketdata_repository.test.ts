import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { MarketDataRepository } from "./marketdata_repository";

const mockSend = jest.fn();

function createRepo() {
  const client = { send: mockSend } as unknown as DynamoDBDocumentClient;
  return new MarketDataRepository({ tableName: "Dummy", client });
}

describe("MarketDataRepository.queryCatalogByMarketFuzzy", () => {
  beforeEach(() => {
    mockSend.mockReset();
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
