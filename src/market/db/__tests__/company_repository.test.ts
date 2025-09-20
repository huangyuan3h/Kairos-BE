import { CompanyRepository } from "@src/market/db/company_repository";

describe("CompanyRepository getByCode uses primary key lookup", () => {
  function createMockDocClient(captured: any[]) {
    return {
      send: async (cmd: any) => {
        captured.push(cmd.input ?? cmd);
        return { Item: undefined };
      },
    } as unknown as import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient;
  }

  it("issues GetItem with Key { pk: code }", async () => {
    const captured: any[] = [];
    const doc = createMockDocClient(captured);
    const repo = new CompanyRepository({ tableName: "CompanyT", client: doc });
    await repo.getByCode({ code: "SH600519" });

    expect(captured).toHaveLength(1);
    const input = captured[0];
    expect(input.TableName).toBe("CompanyT");
    expect(input.Key).toEqual({ pk: "SH600519" });
  });
});
