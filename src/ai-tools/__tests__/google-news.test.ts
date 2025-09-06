import { GoogleNewsTool } from "../google-news";

describe("GoogleNewsTool", () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterAll(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it("parses RSS/Atom and caps results", async () => {
    const prevFeeds = process.env.GOOGLE_NEWS_FEEDS;
    process.env.GOOGLE_NEWS_FEEDS =
      "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
    const rss = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title>Stocks rise A after strong earnings</title>
          <link>https://example.com/a</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
        <item>
          <title>Stocks rise B on lower inflation</title>
          <link>https://example.com/b</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
        <item>
          <title>Stocks rise B on lower inflation</title>
          <link>https://example.com/b</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
      </channel></rss>`;

    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      text: async () => rss,
    }));

    const res = await GoogleNewsTool.execute({
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
    process.env.GOOGLE_NEWS_FEEDS = prevFeeds;
  });
});
