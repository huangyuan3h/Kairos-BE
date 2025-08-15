import { generateOverallReport } from "../../application/generate_overall_report";

// Mock DynamoDB repository to avoid AWS calls
jest.mock("../../infrastructure/dynamo_report_repository", () => ({
  createDynamoReportRepository: () => ({
    save: async () => {},
  }),
}));

// Mock environment utilities
jest.mock("@src/util/dynamodb", () => ({
  DynamoTable: {
    Reports: "Reports",
  },
  getDynamoTableName: () => "kairos-be-dev-ReportsTable",
}));

// Mock infra dependencies by environment variables where possible
describe("generateOverallReport", () => {
  test("returns structured report and attempts to save", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = await generateOverallReport({
      asOfDate: "2025-01-01",
      marketScope: "CN",
    });

    expect(result.asOfDate).toBe("2025-01-01");
    expect(result.marketScope).toBe("CN");
    expect(result.reportId).toContain("REPORT#CN#OVERALL#2025-01-01");
    expect(result.title).toContain("CN Market Overall Report");
    expect(result.promptVersion).toBe("v2");
    expect(result.modelVersion).toBe("ai-agent-v1");
  });
});
