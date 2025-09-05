import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * News Impact Aggregator (NIA)
 *
 * Purpose:
 * - Aggregate market-moving headlines within a short window and compute a normalized impact score
 * - Provide compact, actionable inputs for the report Overview and sector/stock catalysts
 *
 * Design:
 * - Input controls scope, recency window, and result size
 * - Output is deduplicated and clustered; impact and sentiment are normalized
 * - Never throws: returns Result with fallback meta for graceful degradation
 */

const inputSchema = z.object({
  marketScope: z
    .enum(["CN", "US", "GLOBAL"]) // Market geographic scope for sourcing headlines
    .describe("Market scope: CN | US | GLOBAL"),
  topicHints: z
    .array(z.string())
    .describe("Optional topic keywords to bias selection")
    .optional(),
  // Defaults make the field optional at runtime while preserving a concrete type
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
    .max(20)
    .describe("Max headlines after dedupe (<=20), default 12")
    .default(12),
  // Optional lightweight preview enrichment for top-N items
  previewTopN: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe("Fetch short description for top-N items (<=3). Default 0")
    .default(0),
  previewTimeoutMs: z
    .number()
    .int()
    .min(500)
    .max(10000)
    .describe("Per-preview fetch timeout in ms. Default 3000")
    .default(3000),
  previewMaxChars: z
    .number()
    .int()
    .min(60)
    .max(360)
    .describe("Max characters for preview snippet. Default 160")
    .default(160),
});

/**
 * Output shape consumed by the Overall Report generator.
 * - topHeadlines: deduplicated, impact-scored items
 * - meta: small diagnostics to support observability and fallbacks
 */
export type NewsImpactOutput = {
  /** Sorted by impact desc after dedupe/cluster */
  topHeadlines: Array<{
    /** Stable id (e.g., source+timestamp hash) */
    id: string;
    /** Provider/source name */
    source: string;
    /** ISO8601 publish time */
    publishedAt: string;
    /** Related tickers resolved from content */
    tickers: string[];
    /** Optional GICS sector */
    sector?: string;
    /** Short theme label (e.g., "AI supply chain") */
    theme?: string;
    /** Normalized sentiment in [-1, 1] */
    sentiment: number;
    /** Normalized cross-source impact in [0, 100] */
    impact: number;
    /** Short, declarative summary (<= 140 chars recommended) */
    summary: string;
    /** Optional canonical URL */
    url?: string;
  }>;
  meta: {
    /** Effective window in hours used for the query */
    windowHours: number;
    /** Number of sources queried */
    providerCount: number;
    /** Number of items removed by dedupe */
    deduped: number;
  };
};

/**
 * Normalized minimal headline shape used by fetchers in this module.
 */
export type NormalizedHeadline = {
  id: string;
  source: string;
  title: string;
  url?: string;
  publishedAt: string; // ISO8601
};

// Runtime globals shim to avoid requiring DOM lib types in TS config
type AnyFetch = (input: any, init?: any) => Promise<any>;
type AnyAbortController = new () => { abort: () => void; signal: any };
const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
const AbortControllerCtor: AnyAbortController = (globalThis as any)
  .AbortController as AnyAbortController;
const setTimeoutFn = (globalThis as any).setTimeout as any;
const clearTimeoutFn = (globalThis as any).clearTimeout as any;

// Decode basic HTML entities and numeric references
function decodeHtmlEntities(input: string): string {
  if (!input) return "";
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

/**
 * Fetch top headlines from GDELT Doc API within last 24h.
 * This is a lightweight integration using the public endpoint.
 */
export async function fetchGdeltDocs(input: {
  marketScope: "CN" | "US" | "GLOBAL";
  windowHours: number;
  limit: number;
  topicHints?: string[];
}): Promise<NormalizedHeadline[]> {
  const { marketScope, windowHours, limit, topicHints } = input;

  const base = "https://api.gdeltproject.org/api/v2/doc/doc";
  const defaultQuery = [
    "finance",
    "market",
    "stocks",
    "rates",
    "inflation",
    "earnings",
    "regulation",
  ];
  const keywords = [...defaultQuery, ...(topicHints ?? [])]
    .map((k) => `"${k}"`)
    .join(" OR ");

  const scopeBias = (() => {
    switch (marketScope) {
      case "CN":
        return "(China OR Chinese)";
      case "US":
        return "(United States OR US OR U.S.)";
      default:
        return "";
    }
  })();

  const query = [keywords, scopeBias].filter(Boolean).join(" ");

  const url = `${base}?query=${encodeURIComponent(query)}&timespan=${Math.min(
    Math.max(1, windowHours),
    72,
  )}h&maxrecords=${Math.min(Math.max(1, limit), 50)}&format=json&sort=DateDesc`;

  const controller = new AbortControllerCtor();
  const timeout = setTimeoutFn(() => controller.abort(), 8000);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return [];
    const json: any = await res.json();
    const articles: any[] = Array.isArray(json?.articles) ? json.articles : [];
    return articles.slice(0, limit).map((a) => ({
      id: String(a?.url ?? a?.seendate ?? Math.random()),
      source: String(a?.source ?? a?.domain ?? "GDELT"),
      title: String(a?.title ?? ""),
      url: typeof a?.url === "string" ? a.url : undefined,
      publishedAt: new Date(String(a?.seendate ?? Date.now())).toISOString(),
    }));
  } catch {
    return [];
  } finally {
    clearTimeoutFn(timeout as any);
  }
}

/**
 * Minimal Atom/RSS parser extracting title/link/published timestamp.
 * This is not a full XML parser but sufficient for well-formed feeds we target.
 */
function parseAtomOrRss(xml: string): NormalizedHeadline[] {
  const items: NormalizedHeadline[] = [];
  // Prefer <entry> (Atom)
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
    const summaryHtml =
      block.match(/<summary[\s\S]*?>([\s\S]*?)<\/summary>/)?.[1] ||
      block.match(/<content[\s\S]*?>([\s\S]*?)<\/content>/)?.[1] ||
      "";
    const cleaned = summaryHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const title = cleaned.length > 0 ? cleaned : rawTitle;
    items.push({
      id: `${rawTitle.slice(0, 80)}|${updated}`,
      source: "ATOM",
      title,
      url: linkHref,
      publishedAt: new Date(updated).toISOString(),
    });
  }
  if (items.length > 0) return items;
  // Fallback to RSS <item>
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
    const descHtml =
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ||
      block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/)?.[1] ||
      "";
    const candidate = decodeHtmlEntities(descHtml.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    const title =
      candidate.length > 0
        ? candidate
        : decodeHtmlEntities(rawTitle)
            .replace(/<[^>]+>/g, " ")
            .trim();
    items.push({
      id: `${decodeHtmlEntities(rawTitle).slice(0, 80)}|${pubDate}`,
      source: "RSS",
      title,
      url: link,
      publishedAt: new Date(pubDate).toISOString(),
    });
  }
  return items;
}

/**
 * Fetch a short preview snippet from a URL by inspecting common meta tags and first paragraph.
 */
async function fetchUrlPreview(
  url: string,
  timeoutMs: number,
  maxChars: number,
): Promise<string | undefined> {
  try {
    const controller = new AbortControllerCtor();
    const timeout = setTimeoutFn(() => controller.abort(), timeoutMs);
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    clearTimeoutFn(timeout as any);
    if (!res.ok) return undefined;
    const html = await res.text();
    const re = {
      metaDesc:
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i,
      ogDesc:
        /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["'][^>]*>/i,
      twDesc:
        /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["'][^>]*>/i,
      firstP: /<p[^>]*>(.*?)<\/p>/i,
    };
    const candidates = [
      html.match(re.metaDesc)?.[1],
      html.match(re.ogDesc)?.[1],
      html.match(re.twDesc)?.[1],
      html.match(re.firstP)?.[1],
    ];
    const pick = candidates.find((x) => Boolean(x));
    if (!pick) return undefined;
    const text = decodeHtmlEntities(pick)
      .replace(/<br\s*\/?>(\r?\n)?/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return undefined;
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  } catch {
    return undefined;
  }
}

/**
 * Fetch SEC EDGAR current reports (primarily 8-K) via Atom feed.
 * Respect EDGAR fair access by providing a custom User-Agent via env var.
 */
export async function fetchEdgarCurrentReports(input: {
  limit: number;
}): Promise<NormalizedHeadline[]> {
  const { limit } = input;
  const url =
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&owner=include&count=200&output=atom";
  const ua =
    process.env.EDGAR_USER_AGENT ??
    "KairosBE/1.0 (contact: change-me@example.com)";
  const controller = new AbortControllerCtor();
  const timeout = setTimeoutFn(() => controller.abort(), 8000);
  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": ua,
        Accept: "application/atom+xml,application/rss+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = parseAtomOrRss(xml).slice(0, Math.min(limit, 50));
    return parsed.map((p) => ({ ...p, source: "SEC EDGAR" }));
  } catch {
    return [];
  } finally {
    clearTimeoutFn(timeout as any);
  }
}

/**
 * Fetch recent central bank/regulator headlines via RSS/Atom.
 * Default feeds: Federal Reserve, ECB, Bank of England. Failures are tolerated.
 */
export async function fetchCentralBankFeeds(input: {
  limit: number;
}): Promise<NormalizedHeadline[]> {
  const { limit } = input;
  const feeds: Array<{ name: string; url: string }> = [
    {
      name: "Federal Reserve",
      url: "https://www.federalreserve.gov/feeds/press_all.xml",
    },
    { name: "ECB", url: "https://www.ecb.europa.eu/press/pr/rss/EN.rss" },
    {
      name: "Bank of England",
      url: "https://www.bankofengland.co.uk/boeapps/rss/feeds.aspx?FeedType=MediaCentreNews",
    },
  ];

  const controller = new AbortControllerCtor();
  const timeout = setTimeoutFn(() => controller.abort(), 8000);
  try {
    const results: NormalizedHeadline[] = [];
    await Promise.all(
      feeds.map(async (f) => {
        try {
          const res = await fetchFn(f.url, {
            signal: controller.signal,
            headers: {
              Accept:
                "application/atom+xml,application/rss+xml;q=0.9,*/*;q=0.8",
            },
          });
          if (!res.ok) return;
          const xml = await res.text();
          const parsed = parseAtomOrRss(xml)
            .slice(0, Math.max(1, Math.floor(limit / feeds.length)))
            .map((p) => ({ ...p, source: f.name }));
          results.push(...parsed);
        } catch {
          // ignore single feed failure
        }
      }),
    );
    // Sort by publishedAt desc and cap to limit
    return results
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      .slice(0, limit);
  } finally {
    clearTimeoutFn(timeout as any);
  }
}

/**
 * Exported indirection to allow Jest to mock/stub fetchers easily.
 */
export const NewsFetchers = {
  fetchGdeltDocs,
  fetchEdgarCurrentReports,
  fetchCentralBankFeeds,
};

export const NewsImpactTool = defineTool<
  z.infer<typeof inputSchema>,
  NewsImpactOutput
>({
  name: "news_impact",
  description:
    "Aggregate market-moving headlines with normalized impact scoring",
  category: ToolCategory.NEWS,
  schema: inputSchema,
  async handler(input) {
    // 1) Fetch from three free providers in parallel
    const [gdelt, edgar, central] = await Promise.all([
      NewsFetchers.fetchGdeltDocs({
        marketScope: input.marketScope,
        windowHours: input.windowHours,
        limit: input.limit * 3,
        topicHints: input.topicHints,
      }),
      NewsFetchers.fetchEdgarCurrentReports({ limit: input.limit }),
      NewsFetchers.fetchCentralBankFeeds({ limit: input.limit }),
    ]);

    const combined: NormalizedHeadline[] = [...gdelt, ...edgar, ...central];
    const before = combined.length;

    // 2) Deduplicate by URL OR normalized title (either match counts as duplicate)
    const normalizeTitle = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const seenUrl = new Set<string>();
    const seenTitle = new Set<string>();
    const deduped: NormalizedHeadline[] = [];
    for (const h of combined) {
      const normTitle = normalizeTitle(h.title || "");
      const urlKey = h.url?.trim();

      if (
        (urlKey && seenUrl.has(urlKey)) ||
        (normTitle && seenTitle.has(normTitle))
      ) {
        continue;
      }
      if (urlKey) seenUrl.add(urlKey);
      if (normTitle) seenTitle.add(normTitle);
      deduped.push(h);
    }

    // 3) Score with a simple bandit-inspired heuristic: base weight + recency + topic bonus
    const sourceBaseWeight = (src: string): number => {
      if (src === "SEC EDGAR") return 1.0;
      if (
        src === "Federal Reserve" ||
        src === "ECB" ||
        src === "Bank of England"
      )
        return 0.9;
      if (src.includes("GDELT")) return 0.5;
      return 0.6;
    };
    const recencyWeight = (iso: string): number => {
      const hours = Math.max(
        0,
        (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60),
      );
      return Math.max(0, 1 - Math.min(hours, 48) / 48); // 0..1, 24h内更高
    };
    const topicBonus = (title: string): number => {
      if (!input.topicHints || input.topicHints.length === 0) return 0;
      const lower = title.toLowerCase();
      for (const hint of input.topicHints) {
        if (lower.includes(String(hint).toLowerCase())) return 0.2;
      }
      return 0;
    };

    const scored = deduped.map((h) => {
      const base = sourceBaseWeight(h.source);
      const rec = recencyWeight(h.publishedAt);
      const bonus = topicBonus(h.title);
      const score = Math.max(
        0,
        Math.min(1, base * 0.6 + rec * 0.3 + bonus * 0.1),
      );
      return { headline: h, score };
    });

    // 4) Sort and map to NewsImpactOutput shape
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit)
      .map(({ headline, score }) => ({
        id: headline.id,
        source: headline.source,
        publishedAt: headline.publishedAt,
        tickers: [],
        sector: undefined,
        theme: undefined,
        sentiment: 0,
        impact: Math.round(score * 100),
        summary: headline.title,
        url: headline.url,
      }));

    // 5) Optionally enrich Top-N with short previews
    const enrichN = Math.min(input.previewTopN ?? 0, top.length);
    if (enrichN > 0) {
      await Promise.all(
        top.slice(0, enrichN).map(async (item, idx) => {
          if (!item.url) return;
          const snippet = await fetchUrlPreview(
            item.url,
            input.previewTimeoutMs ?? 3000,
            input.previewMaxChars ?? 160,
          );
          if (snippet) {
            top[idx].summary = snippet;
          }
        }),
      );
    }

    return {
      ok: true,
      data: {
        topHeadlines: top,
        meta: {
          windowHours: input.windowHours,
          providerCount: 3,
          deduped: Math.max(0, before - deduped.length),
        },
      },
    };
  },
});
