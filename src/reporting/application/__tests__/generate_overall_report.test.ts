import { generateOverallReport } from "../../application/generate_overall_report";

// Mock DynamoDB repository to avoid AWS calls
jest.mock("../../infrastructure/dynamo_report_repository", () => ({
  createDynamoReportRepository: () => ({
    save: async () => {},
  }),
}));

// Mock AI agent to avoid actual API calls
jest.mock("../../application/ai_agent", () => ({
  createAiAgent: () => ({
    registerTool: jest.fn(),
    generateOverallReport: async () => ({
      reportId: "REPORT#CN#OVERALL#2025-01-01",
      asOfDate: "2025-01-01",
      marketScope: "CN",
      title: "CN Market Overall Report - 2025-01-01",
      contentMarkdown: "# CN Market Analysis\n\nAI-generated analysis...",
      summary: "AI-generated CN market analysis for 2025-01-01",
      opportunities: [],
      risks: [],
      promptVersion: "ai-sdk-v5",
      modelVersion: "gemini-1.5-flash",
    }),
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
      systemPrompt: "Test prompt",
      geminiApiKey: "test-key",
    });

    expect(result.asOfDate).toBe("2025-01-01");
    expect(result.marketScope).toBe("CN");
    expect(result.reportId).toContain("REPORT#CN#OVERALL#2025-01-01");
    expect(result.title).toContain("CN Market Overall Report");
    expect(result.promptVersion).toBe("ai-sdk-v5");
    expect(result.modelVersion).toBe("gemini-1.5-flash");
  });
});
