import { TimeseriesRepository } from "@src/market/db/timeseries_repository";

describe("TimeseriesRepository ProjectionExpression uses aliases for reserved attributes", () => {
  function createMockDocClient(captured: any[]) {
    return {
      send: async (cmd: any) => {
        captured.push(cmd.input ?? cmd);
        return { Items: [] };
      },
    } as unknown as import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient;
  }

  it("queryBySymbolDateRange maps open/close/etc via ExpressionAttributeNames", async () => {
    const captured: any[] = [];
    const doc = createMockDocClient(captured);
    const repo = new TimeseriesRepository({ tableName: "T", client: doc });
    await repo.queryBySymbolDateRange({
      code: "AAA",
      fromDate: "2024-01-01",
      toDate: "2024-01-10",
    });

    expect(captured).toHaveLength(1);
    const input = captured[0];
    expect(input.ExpressionAttributeNames).toMatchObject({
      "#open": "open",
      "#close": "close",
      "#high": "high",
      "#low": "low",
      "#adj_close": "adj_close",
      "#volume": "volume",
      "#as_of_date": "as_of_date",
      "#date": "date",
    });
    const proj: string = input.ProjectionExpression;
    expect(proj).toContain("#open");
    expect(proj).toContain("#close");
    // Ensure raw names are not used directly to avoid reserved word conflicts
    expect(proj.includes(" open,")).toBe(false);
    expect(proj.includes(" close,")).toBe(false);
  });

  it("queryLatestBySymbol maps open/close/etc via ExpressionAttributeNames", async () => {
    const captured: any[] = [];
    const doc = createMockDocClient(captured);
    const repo = new TimeseriesRepository({ tableName: "T", client: doc });
    await repo.queryLatestBySymbol({ code: "AAA", limit: 5 });

    expect(captured).toHaveLength(1);
    const input = captured[0];
    expect(input.ExpressionAttributeNames).toMatchObject({
      "#open": "open",
      "#close": "close",
      "#high": "high",
      "#low": "low",
      "#adj_close": "adj_close",
      "#volume": "volume",
      "#as_of_date": "as_of_date",
      "#date": "date",
    });
    const proj: string = input.ProjectionExpression;
    expect(proj).toContain("#open");
    expect(proj).toContain("#close");
    expect(proj.includes(" open,")).toBe(false);
    expect(proj.includes(" close,")).toBe(false);
  });
});
