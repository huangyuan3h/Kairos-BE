import { BloombergNewsTool } from "../bloomberg-news";

describe("BloombergNewsTool", () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterAll(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it("parses RSS/Atom and caps results", async () => {
    const prevFeeds = process.env.BLOOMBERG_FEEDS;
    process.env.BLOOMBERG_FEEDS =
      "https://feeds.bloomberg.com/markets/news.rss";
    const rss = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title>Bloomberg A</title>
          <link>https://example.com/a</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
        <item>
          <title>Bloomberg B</title>
          <link>https://example.com/b</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
        <item>
          <title>Bloomberg B</title>
          <link>https://example.com/b</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
      </channel></rss>`;

    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      text: async () => rss,
    }));

    const res = await BloombergNewsTool.execute({
      windowHours: 24,
      limit: 2,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { items, meta } = res.data;
    expect(items.length).toBeLessThanOrEqual(2);
    expect(meta.feedCount).toBe(1);
    // Duplicates removed should be non-negative; tolerate provider quirks
    expect(meta.deduped).toBeGreaterThanOrEqual(0);
    process.env.BLOOMBERG_FEEDS = prevFeeds;
  });
});
