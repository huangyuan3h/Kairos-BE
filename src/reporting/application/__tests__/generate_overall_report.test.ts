import { generateOverallReport } from "../../application/generate_overall_report";

// Mock LLM client to avoid network calls
jest.mock("../../infrastructure/llm_client", () => ({
  createLlmClient: () => ({
    generateReport: async () => ({
      reportId: "REPORT#CN#OVERALL#2025-01-01",
      asOfDate: "2025-01-01",
      marketScope: "CN",
      title: "CN Market Overall Report",
      contentMarkdown: "# Report\n...",
      summary: "stub summary",
      opportunities: [],
      risks: [],
      promptVersion: "v1",
      modelVersion: "stub-model",
    }),
  }),
}));

// Mock DynamoDB repository to avoid AWS calls
jest.mock("../../infrastructure/dynamo_report_repository", () => ({
  createDynamoReportRepository: () => ({
    save: async () => {},
  }),
}));

// Mock infra dependencies by environment variables where possible
describe("generateOverallReport", () => {
  test("returns structured report and attempts to save", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = await generateOverallReport({
      asOfDate: "2025-01-01",
      marketScope: "CN",
      marketDataTableName: "MarketDataTable",
      reportsTableName: "ReportsTable",
    });

    expect(result.asOfDate).toBe("2025-01-01");
    expect(result.marketScope).toBe("CN");
    expect(result.reportId).toContain("REPORT#CN#OVERALL#2025-01-01");
  });
});
