import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * Google News RSS (Simple)
 *
 * Purpose:
 * - Fetch daily news items from configured Google News RSS feeds.
 * - Keep API simple: input defines windowHours and limit. No scoring.
 *
 * Notes:
 * - This tool is intentionally lightweight; downstream components can enrich.
 */

const inputSchema = z.object({
  windowHours: z
    .number()
    .int()
    .positive()
    .max(72)
    .describe("Recency window in hours (<=72), default 24")
    .default(24),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .describe("Max number of items to return (<=50), default 20")
    .default(20),
});

export type GoogleNewsItem = {
  id: string;
  title: string;
  url?: string;
  publishedAt: string; // ISO8601
  source: string; // feed host or label
  section?: string; // derived from feed path
};

export type GoogleNewsOutput = {
  items: GoogleNewsItem[];
  meta: {
    windowHours: number;
    feedCount: number;
    fetched: number;
    deduped: number;
  };
};

// Runtime globals shim
type AnyFetch = (input: any, init?: any) => Promise<any>;
type AnyAbortController = new () => { abort: () => void; signal: any };
const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
const AbortControllerCtor: AnyAbortController = (globalThis as any)
  .AbortController as AnyAbortController;
const setTimeoutFn = (globalThis as any).setTimeout as any;
const clearTimeoutFn = (globalThis as any).clearTimeout as any;

function getGoogleNewsFeeds(): string[] {
  const env = process.env.GOOGLE_NEWS_FEEDS;
  if (env && typeof env === "string") {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
  }
  // Default to English US top, business, and technology sections
  const base = "hl=en-US&gl=US&ceid=US:en";
  return [
    `https://news.google.com/rss?${base}`,
    `https://news.google.com/rss/headlines/section/topic/BUSINESS?${base}`,
    `https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?${base}`,
  ];
}

// Finance-focused filtering
function getIncludeKeywords(): string[] {
  const env = process.env.GOOGLE_NEWS_INCLUDE;
  if (env && typeof env === "string") {
    return env
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }
  return [
    // Macro & policy
    "economy",
    "inflation",
    "disinflation",
    "deflation",
    "recession",
    "growth",
    "gdp",
    "pmi",
    "ism",
    "cpi",
    "ppi",
    "jobs",
    "payrolls",
    "unemployment",
    "retail sales",
    "housing",
    "mortgage",
    "tariff",
    "trade",
    "federal reserve",
    "fed",
    "ecb",
    "boj",
    "pboc",
    "central bank",
    // Markets & assets
    "market",
    "markets",
    "stock",
    "stocks",
    "equity",
    "equities",
    "bond",
    "bonds",
    "treasury",
    "yield",
    "rate",
    "rates",
    "curve",
    "credit",
    "spread",
    "volatility",
    "vix",
    "oil",
    "brent",
    "wti",
    "gas",
    "commodity",
    "commodities",
    "gold",
    "silver",
    "copper",
    "bitcoin",
    "crypto",
    "forex",
    "fx",
    "currency",
    "usd",
    "eur",
    "jpy",
    "gbp",
    "cny",
    // Corporate
    "earnings",
    "revenue",
    "guidance",
    "ipo",
    "merger",
    "acquisition",
    "m&a",
    "dividend",
    "buyback",
    "capital expenditure",
  ];
}

function getExcludeKeywords(): string[] {
  const env = process.env.GOOGLE_NEWS_EXCLUDE;
  if (env && typeof env === "string") {
    return env
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }
  return [
    "lottery",
    "powerball",
    "mega millions",
    "duchess",
    "prince",
    "princess",
    "royal",
    "celebrity",
    "eclipse",
    "moon",
    "sports",
    "nba",
    "nfl",
    "mlb",
    "soccer",
    "olympics",
  ];
}

function shouldKeepByTopic(title: string): boolean {
  const t = title.toLowerCase();
  const include = getIncludeKeywords();
  const exclude = getExcludeKeywords();
  const hitsInclude = include.some((k) => t.includes(k));
  if (!hitsInclude) return false;
  if (exclude.some((k) => t.includes(k))) return false;
  return true;
}

// Basic text sanitization: remove CDATA, HTML tags, collapse spaces, decode entities
function stripCdata(input: string): string {
  return input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function sanitizeText(input: string): string {
  if (!input) return "";
  const noCdata = stripCdata(input);
  const noHtml = noCdata.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(noHtml);
  return decoded.replace(/\s+/g, " ").trim();
}

// Minimal Atom/RSS parser extracting title/link/published timestamp
function parseAtomOrRss(xml: string): GoogleNewsItem[] {
  const items: GoogleNewsItem[] = [];
  const entryRegex = /<entry[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRegex) ?? [];
  for (const block of entries) {
    const rawTitle = (
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""
    ).trim();
    const updated =
      block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() ||
      block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ||
      new Date().toISOString();
    const linkHref =
      block.match(/<link[^>]*?href="([^"]+)"[^>]*\/>/)?.[1] ||
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const title = sanitizeText(rawTitle);
    items.push({
      id: `${title.slice(0, 80)}|${updated}`,
      title,
      url: linkHref,
      publishedAt: new Date(updated).toISOString(),
      source: "RSS",
    });
  }
  if (items.length > 0) return items;
  const itemRegex = /<item[\s\S]*?<\/item>/g;
  const rssItems = xml.match(itemRegex) ?? [];
  for (const block of rssItems) {
    const rawTitle = (
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""
    ).trim();
    const pubDate =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ||
      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/)?.[1]?.trim() ||
      new Date().toUTCString();
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const title = sanitizeText(rawTitle);
    items.push({
      id: `${title.slice(0, 80)}|${pubDate}`,
      title,
      url: link,
      publishedAt: new Date(pubDate).toISOString(),
      source: "RSS",
    });
  }
  return items;
}

async function fetchFeed(
  url: string,
  timeoutMs = 8000,
): Promise<GoogleNewsItem[]> {
  const controller = new AbortControllerCtor();
  const timeout = setTimeoutFn(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/atom+xml,application/rss+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const host = url.replace(/^https?:\/\//i, "").split("/")[0] || "RSS";
    const path = url.replace(/^https?:\/\/(?:[^/]+)(\/.*)$/i, "$1");
    const section = (
      path.split("/").find((seg) => seg.length > 0) ?? ""
    ).toLowerCase();
    return parseAtomOrRss(xml).map((i) => ({
      ...i,
      source: host,
      section: section || undefined,
    }));
  } catch {
    return [];
  } finally {
    clearTimeoutFn(timeout as any);
  }
}

export const GoogleNewsTool = defineTool<
  z.infer<typeof inputSchema>,
  GoogleNewsOutput
>({
  name: "google_news",
  description: "Fetch daily Google News RSS items (simple, deduped, capped)",
  category: ToolCategory.NEWS,
  schema: inputSchema,
  async handler(input) {
    const { windowHours, limit } = input;
    const feeds = getGoogleNewsFeeds();

    const results = await Promise.all(feeds.map((f) => fetchFeed(f)));
    const all = results.flat();

    // Finance-only filter by title keywords
    const financeOnly = all.filter((i) => shouldKeepByTopic(i.title));

    const cutoff =
      Date.now() - Math.min(Math.max(1, windowHours), 72) * 3600 * 1000;
    const withinWindow = financeOnly.filter(
      (i) => new Date(i.publishedAt).getTime() >= cutoff,
    );

    // Deduplicate by URL or title
    const seenUrl = new Set<string>();
    const seenTitle = new Set<string>();
    const deduped: GoogleNewsItem[] = [];
    for (const it of withinWindow) {
      const urlKey = it.url?.trim();
      const titleKey = it.title.trim().toLowerCase();
      if (
        (urlKey && seenUrl.has(urlKey)) ||
        (titleKey && seenTitle.has(titleKey))
      )
        continue;
      if (urlKey) seenUrl.add(urlKey);
      if (titleKey) seenTitle.add(titleKey);
      deduped.push(it);
    }

    // Sort by publishedAt desc
    const sorted = deduped.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    const items = sorted.slice(0, Math.min(Math.max(1, limit), 50));

    return {
      ok: true,
      data: {
        items,
        meta: {
          windowHours,
          feedCount: feeds.length,
          fetched: all.length,
          deduped: Math.max(0, withinWindow.length - deduped.length),
        },
      },
    };
  },
});
