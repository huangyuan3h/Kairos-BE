import { getReportSummaries } from "../business/get_report";

jest.mock("../db/dynamo_report_repository", () => {
  return {
    createDynamoReportRepository: () => ({
      findSummariesByType: async ({ type, currentPage, pageSize }: any) => {
        if (type !== "overall") {
          throw new Error(`Unsupported report type: ${type}`);
        }
        return {
          reports: [
            {
              reportId: "REPORT#1",
              asOfDate: "2024-01-01",
              title: "Title 1",
              createdAt: "2024-01-01T00:00:00.000Z",
            },
            {
              reportId: "REPORT#2",
              asOfDate: "2024-01-02",
              title: "Title 2",
              createdAt: "2024-01-02T00:00:00.000Z",
            },
          ].slice(0, pageSize),
          totalCount: Math.min(2, pageSize),
          currentPage,
          pageSize,
          totalPages: 1,
        };
      },
    }),
  };
});

describe("getReportSummaries", () => {
  it("returns summaries without content field", async () => {
    const result = await getReportSummaries({
      type: "overall",
      currentPage: 1,
      pageSize: 2,
    });

    expect(result.reports.length).toBe(2);
    for (const item of result.reports) {
      expect(item).toHaveProperty("reportId");
      expect(item).toHaveProperty("asOfDate");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("createdAt");
      expect((item as any).content).toBeUndefined();
    }
  });

  it("throws on unsupported type", async () => {
    await expect(
      getReportSummaries({ type: "unknown", currentPage: 1, pageSize: 10 })
    ).rejects.toThrow("Unsupported report type");
  });
});
