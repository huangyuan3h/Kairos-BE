import * as NewsModule from "../news";

describe("NewsImpactTool handler", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("aggregates, dedupes, scores, and caps results", async () => {
    const nowIso = new Date().toISOString();

    jest.spyOn(NewsModule.NewsFetchers, "fetchGdeltDocs").mockResolvedValue([
      {
        id: "g1",
        source: "GDELT",
        title: "Global rates rising on policy shift",
        url: "https://example.com/a",
        publishedAt: nowIso,
      },
      {
        id: "g2",
        source: "GDELT",
        title: "Global rates rising on policy shift", // duplicate title
        url: undefined,
        publishedAt: nowIso,
      },
    ]);

    jest
      .spyOn(NewsModule.NewsFetchers, "fetchEdgarCurrentReports")
      .mockResolvedValue([
        {
          id: "e1",
          source: "SEC EDGAR",
          title: "Company ABC files 8-K regarding leadership change",
          url: "https://edgar.sec.gov/abc",
          publishedAt: nowIso,
        },
      ]);

    jest
      .spyOn(NewsModule.NewsFetchers, "fetchCentralBankFeeds")
      .mockResolvedValue([
        {
          id: "c1",
          source: "Federal Reserve",
          title: "FOMC statement released",
          url: "https://federalreserve.gov/fomc",
          publishedAt: nowIso,
        },
      ]);

    const result = await NewsModule.NewsImpactTool.execute({
      marketScope: "US",
      windowHours: 24,
      limit: 3,
      topicHints: ["rates"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { topHeadlines, meta } = result.data;
    // Deduped: one duplicate from GDELT should be removed
    expect(meta.deduped).toBeGreaterThanOrEqual(1);
    // Provider count should reflect 3 attempted sources
    expect(meta.providerCount).toBe(3);
    // Limit respected
    expect(topHeadlines.length).toBeLessThanOrEqual(3);
    // Sorted by impact descending: SEC/Fed likely top-ranked due to base weight
    const impacts = topHeadlines.map((h) => h.impact);
    const sorted = [...impacts].sort((a, b) => b - a);
    expect(impacts).toEqual(sorted);
  });
});
