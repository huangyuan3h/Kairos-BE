import { getReportById } from "../business/get_report";

jest.mock("../db/dynamo_report_repository", () => {
  return {
    createDynamoReportRepository: () => ({
      findById: async ({ type, reportId }: any) => {
        if (type !== "overall")
          throw new Error(`Unsupported report type: ${type}`);
        if (reportId === "FOUND") {
          return {
            reportId: "FOUND",
            asOfDate: "2024-01-01",
            title: "Title Found",
            content: "Hello content",
            createdAt: "2024-01-01T00:00:00.000Z",
          };
        }
        return null;
      },
    }),
  };
});

describe("getReportById", () => {
  it("returns report with content when found", async () => {
    const report = await getReportById({ type: "overall", reportId: "FOUND" });
    expect(report.content).toBe("Hello content");
    expect(report.reportId).toBe("FOUND");
  });

  it("throws on unsupported type", async () => {
    await expect(
      getReportById({ type: "unknown", reportId: "FOUND" }),
    ).rejects.toThrow("Unsupported report type");
  });

  it("throws when report not found", async () => {
    await expect(
      getReportById({ type: "overall", reportId: "MISSING" }),
    ).rejects.toThrow("Report not found");
  });
});
