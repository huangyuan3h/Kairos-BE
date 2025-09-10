import { z } from "zod";
import { defineTool, ToolCategory } from "./base";

/**
 * Macro & Liquidity Snapshot (MLS)
 *
 * Purpose:
 * - Provide compact macro bullets and a simple risk regime classification
 * - Feed the "Macro Environment (3–5 bullets)" section with directionality
 *
 * Design:
 * - Minimal indicator set by scope; short-window deltas for direction
 * - Transparent, rules-first regime mapping; favors interpretability and speed
 * - Never throws: returns Result with best-effort snapshot and bullets
 */

const inputSchema = z.object({
  windowDays: z.number().int().positive().max(30).default(7),
});

export type MacroSnapshotOutput = {
  /** ISO8601 timestamp when the snapshot was taken */
  asOf: string;
  /** Rolling window in days used to compute short-term deltas */
  windowDays: number;
  /** Simple risk regime classification derived from vol and rate/USD deltas */
  regime: "RiskOn" | "Neutral" | "RiskOff";
  /** Key rates in percent; UST10Y normalized to percent (not x10); CN_* best-effort */
  rates: { UST2Y?: number; UST10Y?: number; CN_R007?: number; CN_MLF?: number };
  /** FX basket; currently DXY level */
  fx: { DXY?: number };
  /** Spot/implied vols; VSTOXX may be unavailable depending on providers */
  vol: { VIX?: number; VSTOXX?: number };
  /** Core commodities in USD; levels */
  commodities: { WTI?: number; GOLD?: number; COPPER?: number };
  /** Short-window changes for selected metrics; sign indicates direction */
  deltas: Record<string, number>;
  /** Concise, declarative bullets summarizing directionality for report drafting */
  bullets: string[];
  /** Source hints for downstream link rendering and observability */
  sources?: string[];
};

/**
 * Standalone resolver for CN_R007 (Shibor 7D as proxy for R007).
 * Returns the latest value if found.
 */
export async function fetchCnR007Standalone(
  _debug = false
): Promise<number | undefined> {
  type AnyFetch = (input: any, init?: any) => Promise<any>;
  const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
  const urls = [
    "https://www.shibor.org/shibor/",
    "http://www.shibor.org/shibor/",
  ];
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  } as const;
  function extract(text: string): number | undefined {
    const tablePatterns = [
      /<td[^>]*>\s*(1W|1周|一周)\s*<\/td>\s*<td[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi,
      /<td[^>]*>\s*(1W|1周|一周)\s*<\/td>[\s\S]*?<td[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi,
      /<[^>]*(?:class|id)[^>]*(?:1w|week)[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</gi,
      /<tr[^>]*>[\s\S]*?(?:1W|1周|一周)[\s\S]*?([0-9]+(?:\.[0-9]+)?)[\s\S]*?<\/tr>/gi,
    ];
    for (const re of tablePatterns) {
      re.lastIndex = 0;
      const matches = Array.from(text.matchAll(re));
      for (const m of matches) {
        const num = m[2] || m[1];
        if (num) {
          const v = Number(num);
          if (Number.isFinite(v) && v > 0 && v < 20) return v;
        }
      }
    }
    const idx = text.toLowerCase().indexOf("1w");
    if (idx >= 0) {
      const slice = text.slice(
        Math.max(0, idx - 200),
        Math.min(text.length, idx + 200)
      );
      const num = slice.match(/([0-9]+(?:\.[0-9]+)?)(?=\s*%?)/);
      if (num) {
        const v = Number(num[1]);
        if (Number.isFinite(v)) return v;
      }
    }
    return undefined;
  }
  for (const u of urls) {
    try {
      const AbortCtor = (globalThis as any).AbortController as any;
      const controller = new AbortCtor();
      const to = (globalThis as any).setTimeout(
        () => controller.abort(),
        7000
      ) as unknown as number;
      const res = await fetchFn(u, { headers, signal: controller.signal });
      (globalThis as any).clearTimeout(to);
      if (!res.ok) continue;
      const html = await res.text();
      const val = extract(html);
      if (typeof val === "number") return val;
    } catch {
      // continue
    }
  }
  // TradingEconomics fallback
  const cred = "guest:guest";
  const candidates = [
    "/shibor/7d",
    "/China/shibor 7 day",
    "/China/Interbank%20Rate",
  ];
  for (const path of candidates) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://api.tradingeconomics.com${path}${sep}c=${encodeURIComponent(cred)}&format=json`;
    try {
      const AbortCtor = (globalThis as any).AbortController as any;
      const controller = new AbortCtor();
      const to = (globalThis as any).setTimeout(
        () => controller.abort(),
        7000
      ) as unknown as number;
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      (globalThis as any).clearTimeout(to);
      if (!res.ok) continue;
      const json = await res.json();
      const arr = Array.isArray(json) ? json : [json];
      for (const row of arr) {
        const desc = String(
          row?.Category || row?.Indicator || row?.shortname || ""
        ).toLowerCase();
        if (!desc.includes("shibor") && !desc.includes("interbank")) continue;
        const v = Number(row?.LatestValue ?? row?.Last ?? row?.Value);
        if (Number.isFinite(v)) return v;
      }
    } catch {
      // continue
    }
  }
  return undefined;
}

/**
 * Standalone resolver for CN_MLF rate.
 */
export async function fetchCnMlfStandalone(): Promise<number | undefined> {
  type AnyFetch = (input: any, init?: any) => Promise<any>;
  const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
  const listUrls = [
    "http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125446/125873/index.html",
  ];
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  } as const;
  const detailPatterns = [
    /MLF[^)]*?rate[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
    /中期借贷便利（?MLF）?利率为?\s*([0-9]+(?:\.[0-9]+)?)%/,
    /MLF\s*利率[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
    /medium.*?lending.*?facility.*?rate[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
  ];
  for (const listUrl of listUrls) {
    try {
      const AbortCtor = (globalThis as any).AbortController as any;
      const ctrl1 = new AbortCtor();
      const t1 = (globalThis as any).setTimeout(
        () => ctrl1.abort(),
        7000
      ) as unknown as number;
      const res = await fetchFn(listUrl, { headers, signal: ctrl1.signal });
      (globalThis as any).clearTimeout(t1);
      if (!res.ok) continue;
      const listHtml = await res.text();
      const linkPatterns = [
        /href="(\/zhengcehuobisi\/125207\/125213\/125446\/125873\/\d+\/index\.html)"/i,
        /<a[^>]+href="([^"]+\/125873\/\d+\/index\.html)"[^>]*>/i,
      ];
      let detailUrl: string | null = null;
      for (const re of linkPatterns) {
        const m = listHtml.match(re);
        if (m) {
          const rawHref = m[1] as string;
          let abs = rawHref;
          if (abs.startsWith("/")) abs = "http://www.pbc.gov.cn" + abs;
          else if (!abs.startsWith("http")) {
            const basePath = listUrl.substring(0, listUrl.lastIndexOf("/"));
            abs = basePath + "/" + abs;
          }
          detailUrl = abs;
          break;
        }
      }
      if (typeof detailUrl === "string") {
        const ctrl2 = new AbortCtor();
        const t2 = (globalThis as any).setTimeout(
          () => ctrl2.abort(),
          7000
        ) as unknown as number;
        const res2 = await fetchFn(detailUrl, {
          headers,
          signal: ctrl2.signal,
        });
        (globalThis as any).clearTimeout(t2);
        if (res2.ok) {
          const html = await res2.text();
          const reRate = /中标利率[^0-9]*([0-9]+(?:\.[0-9]+)?)%/i;
          const m2 = html.match(reRate);
          if (m2 && Number.isFinite(Number(m2[1]))) {
            const v = Number(m2[1]);
            return v;
          }
        }
      }
      // Direct match on list page
      for (const re3 of detailPatterns) {
        const m3 = listHtml.match(re3);
        if (m3) {
          const v = Number(m3[1]);
          if (Number.isFinite(v)) return v;
        }
      }
    } catch {
      // continue
    }
  }
  // TradingEconomics fallback
  const cred = "guest:guest";
  const candidates = [
    "/indicators/China:Medium-term Lending Facility Rate",
    "/indicators/medium-term lending facility rate:China",
    "/indicators/china%20medium-term%20lending%20facility%20rate",
  ];
  for (const path of candidates) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://api.tradingeconomics.com${path}${sep}c=${encodeURIComponent(cred)}&format=json`;
    try {
      const AbortCtor = (globalThis as any).AbortController as any;
      const ctrl = new AbortCtor();
      const t = (globalThis as any).setTimeout(
        () => ctrl.abort(),
        7000
      ) as unknown as number;
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      (globalThis as any).clearTimeout(t);
      if (!res.ok) continue;
      const json = await res.json();
      if (!Array.isArray(json)) continue;
      for (const row of json) {
        const val = Number(row?.LatestValue ?? row?.Value);
        if (Number.isFinite(val)) return val;
      }
    } catch {
      // continue
    }
  }
  return undefined;
}

/**
 * Standalone resolver for VSTOXX level and delta.
 */
export async function fetchVstoxxStandalone(
  windowDays: number,
  debug = false
): Promise<{ value?: number; delta?: number }> {
  type AnyFetch = (input: any, init?: any) => Promise<any>;
  const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
  // Yahoo chart first
  try {
    const AbortCtor = (globalThis as any).AbortController as any;
    const ctrl1 = new AbortCtor();
    const t1 = (globalThis as any).setTimeout(
      () => ctrl1.abort(),
      7000
    ) as unknown as number;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent("^V2TX")}?range=${encodeURIComponent(
      `${Math.max(2, Math.min(30, windowDays))}d`
    )}&interval=1d`;
    const res = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: ctrl1.signal,
    });
    (globalThis as any).clearTimeout(t1);
    if (res.ok) {
      const json = await res.json();
      const closes =
        json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const valid = (closes as any[]).filter(
        v => typeof v === "number" && Number.isFinite(v)
      );
      if (valid.length >= 1) {
        const first = valid[0] as number;
        const last = valid[valid.length - 1] as number;
        const delta = valid.length >= 2 ? last - first : undefined;
        if (debug)
          // eslint-disable-next-line no-console
          console.log("[VSTOXX:yahoo:^V2TX] value=", last, "delta=", delta);
        return { value: last, delta };
      }
    }
  } catch {
    void 0;
  }
  // Stooq CSV fallback
  try {
    const AbortCtor = (globalThis as any).AbortController as any;
    const ctrl2 = new AbortCtor();
    const t2 = (globalThis as any).setTimeout(
      () => ctrl2.abort(),
      7000
    ) as unknown as number;
    const url = `https://stooq.com/q/d/l/?s=v2tx&i=d`;
    const res = await fetchFn(url, {
      headers: { Accept: "text/csv" },
      signal: ctrl2.signal,
    });
    (globalThis as any).clearTimeout(t2);
    if (res.ok) {
      const csv = await res.text();
      const lines = csv
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);
      if (lines.length > 1) {
        const rows = lines.slice(1).map((l: string) => l.split(","));
        const closes = rows
          .map((cols: string[]) => Number(cols[4]))
          .filter((v: number) => Number.isFinite(v));
        if (closes.length > 0) {
          const slice = closes.slice(
            -Math.max(2, Math.min(windowDays, closes.length))
          );
          const first = slice[0];
          const last = slice[slice.length - 1];
          const delta = slice.length >= 2 ? last - first : undefined;
          if (debug)
            // eslint-disable-next-line no-console
            console.log("[VSTOXX:stooq:v2tx] value=", last, "delta=", delta);
          return { value: last, delta };
        }
      }
    }
  } catch {
    void 0;
  }
  // Yahoo alt ticker
  try {
    const AbortCtor = (globalThis as any).AbortController as any;
    const ctrl3 = new AbortCtor();
    const t3 = (globalThis as any).setTimeout(
      () => ctrl3.abort(),
      7000
    ) as unknown as number;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent("V2TX.DE")}?range=${encodeURIComponent(
      `${Math.max(2, Math.min(30, windowDays))}d`
    )}&interval=1d`;
    const res = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: ctrl3.signal,
    });
    (globalThis as any).clearTimeout(t3);
    if (res.ok) {
      const json = await res.json();
      const closes =
        json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const valid = (closes as any[]).filter(
        v => typeof v === "number" && Number.isFinite(v)
      );
      if (valid.length >= 1) {
        const first = valid[0] as number;
        const last = valid[valid.length - 1] as number;
        const delta = valid.length >= 2 ? last - first : undefined;
        if (debug)
          // eslint-disable-next-line no-console
          console.log("[VSTOXX:yahoo:V2TX.DE] value=", last, "delta=", delta);
        return { value: last, delta };
      }
    }
  } catch {
    void 0;
  }
  return {};
}

export const MacroLiquiditySnapshotTool = defineTool<
  z.infer<typeof inputSchema>,
  MacroSnapshotOutput
>({
  name: "macro_liquidity_snapshot",
  description:
    "Provide compact macro & liquidity bullets with regime classification",
  category: ToolCategory.MACRO,
  schema: inputSchema,
  async handler(input) {
    const windowDays = Math.min(Math.max(1, input.windowDays ?? 7), 30);
    const asOf = new Date().toISOString();

    // Runtime shims
    type AnyFetch = (input: any, init?: any) => Promise<any>;
    type AnyAbortController = new () => { abort: () => void; signal: any };
    const fetchFn: AnyFetch = (globalThis as any).fetch as AnyFetch;
    const AbortControllerCtor: AnyAbortController = (globalThis as any)
      .AbortController as AnyAbortController;
    const setTimeoutFn = (globalThis as any).setTimeout as any;
    const clearTimeoutFn = (globalThis as any).clearTimeout as any;

    // =============================
    // Yahoo Finance symbols mapping
    // =============================
    const symbols = {
      UST10Y: "^TNX", // 10Y yield * 10
      UST5Y: "^FVX", // 5Y yield * 10 (proxy fallback for 2Y)
      DXY: "DX=F", // U.S. Dollar Index futures
      VIX: "^VIX",
      VSTOXX: "^V2TX", // EuroStoxx 50 volatility
      WTI: "CL=F",
      GOLD_SPOT: "XAUUSD=X", // Spot gold in USD
      COPPER: "HG=F",
    } as const;

    // ======================================
    // CN: MLF rate via PBOC web (best-effort)
    // ======================================
    async function _fetchCnMlfFromPBOCWeb(): Promise<number | undefined> {
      const listUrls = [
        "http://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html",
        "http://www.pbc.gov.cn/english/130721/130922/index.html",
      ];

      // Try list page → detail page approach first
      for (const listUrl of listUrls) {
        const listHtml = await _fetchHtml(listUrl);
        if (!listHtml) continue;

        // Find first announcement link (look for href patterns)
        const linkPatterns = [
          /<a[^>]+href="([^"]*(?:113456|130721)[^"]*)"[^>]*>/i,
          /<a[^>]+href="([^"]+\.html)"[^>]*>.*?(?:MLF|中期借贷便利|medium.*?lending)/i,
        ];

        let detailUrl = null;
        for (const linkPattern of linkPatterns) {
          const linkMatch = listHtml.match(linkPattern);
          if (linkMatch) {
            detailUrl = linkMatch[1];
            // Make absolute URL
            if (detailUrl.startsWith("/")) {
              detailUrl = "http://www.pbc.gov.cn" + detailUrl;
            } else if (!detailUrl.startsWith("http")) {
              const basePath = listUrl.substring(0, listUrl.lastIndexOf("/"));
              detailUrl = basePath + "/" + detailUrl;
            }
            break;
          }
        }

        if (detailUrl) {
          const detailHtml = await _fetchHtml(detailUrl);
          if (detailHtml) {
            const detailPatterns = [
              /MLF[^(]*?rate[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
              /中期借贷便利（?MLF）?利率为?\s*([0-9]+(?:\.[0-9]+)?)%/,
              /MLF\s*利率[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
              /medium.*?lending.*?facility.*?rate[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
            ];

            for (const re of detailPatterns) {
              const m = detailHtml.match(re);
              if (m) {
                const v = Number(m[1]);
                if (Number.isFinite(v)) return v;
              }
            }
          }
        }

        // Fallback: try direct pattern matching on list page
        const directPatterns = [
          /MLF[^(]*?rate[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
          /中期借贷便利（?MLF）?利率为?\s*([0-9]+(?:\.[0-9]+)?)%/,
          /MLF\s*利率[^0-9]*?([0-9]+(?:\.[0-9]+)?)%/i,
        ];

        for (const re of directPatterns) {
          const m = listHtml.match(re);
          if (m) {
            const v = Number(m[1]);
            if (Number.isFinite(v)) return v;
          }
        }
      }
      return undefined;
    }

    // ======================
    // Generic HTML utilities
    // ======================
    async function _fetchHtml(url: string): Promise<string | undefined> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000
      ) as unknown as number;
      try {
        const res = await fetchFn(url, {
          signal: (controller as any).signal,
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) return undefined;

        // Try GBK decode first for Chinese sites, fallback to UTF-8
        try {
          const buf = await res.arrayBuffer();
          const TextDecoderCtor = (globalThis as any).TextDecoder as any;
          if (TextDecoderCtor) {
            try {
              const gbkDecoder = new TextDecoderCtor("gbk");
              return gbkDecoder.decode(buf);
            } catch {
              try {
                const utf8Decoder = new TextDecoderCtor("utf-8");
                return utf8Decoder.decode(buf);
              } catch {
                // Fallback to text() if TextDecoder fails
                return await res.clone().text();
              }
            }
          } else {
            return await res.text();
          }
        } catch {
          return await res.text();
        }
      } catch {
        return undefined;
      } finally {
        clearTimeoutFn(timeout as any);
      }
    }

    function _extractNearbyNumber(
      html: string,
      markers: string[]
    ): number | undefined {
      const lower = html.toLowerCase();
      for (const m of markers) {
        const idx = lower.indexOf(m.toLowerCase());
        if (idx < 0) continue;
        const windowStart = Math.max(0, idx - 200);
        const windowEnd = Math.min(html.length, idx + 200);
        const slice = html.slice(windowStart, windowEnd);
        const num = slice.match(/([0-9]+(?:\.[0-9]+)?)(?=\s*%?)/);
        if (num) {
          const v = Number(num[1]);
          if (Number.isFinite(v)) return v;
        }
      }
      return undefined;
    }

    async function _teGetJson(path: string): Promise<any> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000
      ) as unknown as number;
      try {
        const cred = "guest:guest"; // getTradingEconomicsCred(); // Removed as per edit hint
        const sep = path.includes("?") ? "&" : "?";
        const url = `https://api.tradingeconomics.com${path}${sep}c=${encodeURIComponent(
          cred
        )}&format=json`;
        const res = await fetchFn(url, {
          signal: (controller as any).signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return undefined;
        return await res.json();
      } catch {
        return undefined;
      } finally {
        clearTimeoutFn(timeout as any);
      }
    }

    async function fetchQuote(
      symbolList: string[]
    ): Promise<Record<string, number>> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000
      ) as unknown as number;
      try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
          symbolList.join(",")
        )}`;
        const res = await fetchFn(url, {
          signal: (controller as any).signal,
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) return {};
        const json = await res.json();
        const result = (json?.quoteResponse?.result ?? []) as Array<any>;
        const map: Record<string, number> = {};
        for (const row of result) {
          const sym = String(row.symbol);
          const price = Number(
            row.regularMarketPrice ?? row.postMarketPrice ?? row.preMarketPrice
          );
          if (Number.isFinite(price)) map[sym] = price;
        }
        return map;
      } catch {
        return {};
      } finally {
        clearTimeoutFn(timeout as any);
      }
    }

    // Note: fetchDelta kept only for backward-compat if needed elsewhere
    async function _fetchDelta(_symbol: string): Promise<number | undefined> {
      return undefined;
    }

    async function fetchChart(symbol: string): Promise<{
      lastClose?: number;
      firstClose?: number;
      delta?: number;
    }> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000
      ) as unknown as number;
      try {
        const range = `${windowDays}d`;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          symbol
        )}?range=${range}&interval=1d`;
        const res = await fetchFn(url, {
          signal: (controller as any).signal,
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) return {};
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        const closes: Array<number | null | undefined> =
          result?.indicators?.quote?.[0]?.close ?? [];
        const valid = closes.filter(
          (v: any) => typeof v === "number" && Number.isFinite(v)
        ) as number[];
        if (valid.length === 0) return {};
        const first = valid[0];
        const last = valid[valid.length - 1];
        const delta =
          valid.length >= 2 && Number.isFinite(first) && Number.isFinite(last)
            ? last - first
            : undefined;
        return { lastClose: last, firstClose: first, delta };
      } catch {
        return {};
      } finally {
        clearTimeoutFn(timeout as any);
      }
    }

    // Stooq daily CSV for simple yields (no key): https://stooq.com/db/en/
    // Example: us2y (US 2Y), returns CSV with Date,Open,High,Low,Close,Volume
    async function fetchStooqSeries(
      stooqSymbol: string,
      maxPoints: number
    ): Promise<{ lastClose?: number; firstClose?: number; delta?: number }> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000
      ) as unknown as number;
      try {
        const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(
          stooqSymbol
        )}&i=d`;
        const res = await fetchFn(url, {
          signal: (controller as any).signal,
          headers: {
            Accept: "text/csv,application/octet-stream;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) return {};
        const csv = await res.text();
        const lines = csv
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        if (lines.length <= 1) return {};
        const rows = lines.slice(1).map((l: string) => l.split(","));
        const closes: number[] = rows
          .map((cols: string[]) => Number(cols[4]))
          .filter((v: number) => Number.isFinite(v));
        if (closes.length === 0) return {};
        const slice = closes.slice(
          -Math.max(2, Math.min(maxPoints, closes.length))
        );
        const first = slice[0];
        const last = slice[slice.length - 1];
        const delta = slice.length >= 2 ? last - first : undefined;
        return { lastClose: last, firstClose: first, delta };
      } catch {
        return {};
      } finally {
        clearTimeoutFn(timeout as any);
      }
    }

    // ===================================
    // CN proxies via TradingEconomics API
    // ===================================
    // (removed unused TE proxy resolver functions)

    // Fetch latest quotes
    const quoteMap = await fetchQuote([
      symbols.UST10Y,
      symbols.DXY,
      symbols.VIX,
      symbols.VSTOXX,
      symbols.WTI,
      symbols.GOLD_SPOT,
      symbols.COPPER,
    ]);

    // Map to snapshot values
    function normalizeTnxToPercent(raw?: number): number | undefined {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
      // Heuristic: old Yahoo yields sometimes 10x (e.g., 41.2); modern values ~4.1
      return raw >= 20 ? raw / 10 : raw;
    }

    const rates = {
      UST10Y: normalizeTnxToPercent(quoteMap[symbols.UST10Y]),
      // UST2Y will be filled from Stooq below
    } as { UST2Y?: number; UST10Y?: number; CN_R007?: number; CN_MLF?: number };
    const fx = { DXY: quoteMap[symbols.DXY] } as { DXY?: number };
    const vol = {
      VIX: quoteMap[symbols.VIX],
      VSTOXX: quoteMap[symbols.VSTOXX],
    } as { VIX?: number; VSTOXX?: number };
    const commodities = {
      WTI: quoteMap[symbols.WTI],
      GOLD: quoteMap[symbols.GOLD_SPOT],
      COPPER: quoteMap[symbols.COPPER],
    } as { WTI?: number; GOLD?: number; COPPER?: number };

    // Fallback values and deltas from chart
    const [
      cUST10Y,
      cDXY,
      cWTI,
      cVIX,
      cGOLD,
      cCOPPER,
      cVSTOXX,
      cUST2Y,
      cUST5Y,
      cGCFUT,
      cVSTOXX_S,
      cXAUUSD_S,
      cVSTOXX_Y2,
    ] = await Promise.all([
      fetchChart(symbols.UST10Y),
      fetchChart(symbols.DXY),
      fetchChart(symbols.WTI),
      fetchChart(symbols.VIX),
      fetchChart(symbols.GOLD_SPOT),
      fetchChart(symbols.COPPER),
      fetchChart(symbols.VSTOXX),
      fetchStooqSeries("us2y", windowDays),
      fetchChart(symbols.UST5Y),
      fetchChart("GC=F"),
      fetchStooqSeries("v2tx", windowDays),
      fetchStooqSeries("xauusd", windowDays),
      fetchChart("V2TX.DE"),
    ]);

    // Fill missing values from lastClose
    if (rates.UST10Y == null && typeof cUST10Y.lastClose === "number") {
      rates.UST10Y = normalizeTnxToPercent(cUST10Y.lastClose);
    }
    if (rates.UST2Y == null && typeof cUST2Y.lastClose === "number") {
      rates.UST2Y = cUST2Y.lastClose; // Stooq yields already in percent
    }
    if (rates.UST2Y == null && typeof cUST5Y.lastClose === "number") {
      // Fallback proxy using 5Y
      rates.UST2Y = normalizeTnxToPercent(cUST5Y.lastClose);
    }
    if (fx.DXY == null && typeof cDXY.lastClose === "number") {
      fx.DXY = cDXY.lastClose;
    }
    if (vol.VIX == null && typeof cVIX.lastClose === "number") {
      vol.VIX = cVIX.lastClose;
    }
    if (vol.VSTOXX == null && typeof cVSTOXX.lastClose === "number") {
      vol.VSTOXX = cVSTOXX.lastClose;
    }
    if (vol.VSTOXX == null && typeof cVSTOXX_Y2?.lastClose === "number") {
      vol.VSTOXX = cVSTOXX_Y2.lastClose;
    }
    if (vol.VSTOXX == null && typeof cVSTOXX_S.lastClose === "number") {
      vol.VSTOXX = cVSTOXX_S.lastClose;
    }
    if (commodities.WTI == null && typeof cWTI.lastClose === "number") {
      commodities.WTI = cWTI.lastClose;
    }
    if (commodities.GOLD == null && typeof cGOLD.lastClose === "number") {
      commodities.GOLD = cGOLD.lastClose;
    }
    if (commodities.GOLD == null && typeof cGCFUT.lastClose === "number") {
      commodities.GOLD = cGCFUT.lastClose;
    }
    if (commodities.GOLD == null && typeof cXAUUSD_S.lastClose === "number") {
      commodities.GOLD = cXAUUSD_S.lastClose;
    }
    if (commodities.COPPER == null && typeof cCOPPER.lastClose === "number") {
      commodities.COPPER = cCOPPER.lastClose;
    }

    const deltas: Record<string, number> = {};
    if (typeof cUST10Y.delta === "number")
      deltas.UST10Y = normalizeTnxToPercent(cUST10Y.delta) ?? cUST10Y.delta;
    if (typeof cUST2Y.delta === "number") deltas.UST2Y = cUST2Y.delta;
    else if (typeof cUST5Y.delta === "number")
      deltas.UST2Y = normalizeTnxToPercent(cUST5Y.delta) ?? cUST5Y.delta;
    if (typeof cDXY.delta === "number") deltas.DXY = cDXY.delta;
    if (typeof cWTI.delta === "number") deltas.WTI = cWTI.delta;
    if (typeof cVIX.delta === "number") deltas.VIX = cVIX.delta;
    if (typeof cVSTOXX.delta === "number") deltas.VSTOXX = cVSTOXX.delta;
    else if (typeof cVSTOXX_Y2?.delta === "number")
      deltas.VSTOXX = cVSTOXX_Y2.delta;
    else if (typeof cVSTOXX_S.delta === "number")
      deltas.VSTOXX = cVSTOXX_S.delta;

    // CN rates via standalone resolvers (web → TE)
    const [cnR007Val, cnMlfVal] = await Promise.all([
      fetchCnR007Standalone(),
      fetchCnMlfStandalone(),
    ]);
    if (rates.CN_R007 == null && typeof cnR007Val === "number")
      rates.CN_R007 = cnR007Val;
    if (rates.CN_MLF == null && typeof cnMlfVal === "number")
      rates.CN_MLF = cnMlfVal;

    // Simple regime heuristic
    const vixVal = vol.VIX;
    const dxyDelta = deltas.DXY ?? 0;
    const ust10yDelta = deltas.UST10Y ?? 0;
    let regime: "RiskOn" | "Neutral" | "RiskOff" = "Neutral";
    if (typeof vixVal === "number") {
      if (vixVal < 15 && ust10yDelta <= 0 && dxyDelta <= 0.2) regime = "RiskOn";
      else if (vixVal > 20 || dxyDelta > 0.7) regime = "RiskOff";
      else regime = "Neutral";
    }

    // If too few core metrics present, fail fast (no mock)
    const availableCount = [
      rates.UST10Y,
      fx.DXY,
      vol.VIX,
      commodities.WTI,
      commodities.GOLD,
      commodities.COPPER,
    ].filter(v => typeof v === "number" && Number.isFinite(v as number)).length;
    if (availableCount < 2) {
      return {
        ok: false,
        error:
          "Macro data fetch failed: insufficient metrics available (need >= 2). Check network/providers.",
      } as any;
    }

    // Bullets
    const bullets: string[] = [];
    if (typeof rates.UST10Y === "number" && typeof deltas.UST10Y === "number") {
      bullets.push(
        `${deltas.UST10Y >= 0 ? "Yields rise" : "Yields decline"}; 10Y at ${rates.UST10Y.toFixed(2)}%`
      );
    }
    if (typeof fx.DXY === "number" && typeof deltas.DXY === "number") {
      bullets.push(
        `USD ${deltas.DXY >= 0 ? "strengthens" : "softens"}; DXY ${fx.DXY.toFixed(1)}`
      );
    }
    if (typeof vol.VIX === "number") {
      bullets.push(
        `Volatility ${
          typeof deltas.VIX === "number" && deltas.VIX >= 0 ? "up" : "subdued"
        }`
      );
    }
    if (typeof commodities.WTI === "number" && typeof deltas.WTI === "number") {
      bullets.push(
        `Crude ${deltas.WTI >= 0 ? "rebounds" : "eases"}; WTI $${commodities.WTI.toFixed(1)}`
      );
    }
    if (bullets.length === 0) {
      bullets.push(
        "Macro snapshot available; insufficient deltas for directionality"
      );
    }

    const sources = [
      "YahooFinance:quote",
      "YahooFinance:chart",
      "Stooq:csv",
      "CN:web",
      "TradingEconomics:guest",
    ];

    // Optional debug logging for network/env diagnostics
    const debugFlag = String(process.env.MACRO_DEBUG || "").toLowerCase();
    const debugEnabled = debugFlag === "1" || debugFlag === "true";
    if (debugEnabled) {
      const missing: Record<string, string[]> = {
        rates: [],
        fx: [],
        vol: [],
        commodities: [],
      };
      if (rates.UST2Y == null) missing.rates.push("UST2Y");
      if (rates.UST10Y == null) missing.rates.push("UST10Y");
      if (rates.CN_R007 == null) missing.rates.push("CN_R007");
      if (rates.CN_MLF == null) missing.rates.push("CN_MLF");
      if (fx.DXY == null) missing.fx.push("DXY");
      if (vol.VIX == null) missing.vol.push("VIX");
      if (vol.VSTOXX == null) missing.vol.push("VSTOXX");
      if (commodities.WTI == null) missing.commodities.push("WTI");
      if (commodities.GOLD == null) missing.commodities.push("GOLD");
      if (commodities.COPPER == null) missing.commodities.push("COPPER");
      // eslint-disable-next-line no-console
      console.log(
        "[MACRO_DEBUG] asOf=%s windowDays=%d missing=%o ratesFxVolCommodities=%o sources=%o",
        asOf,
        windowDays,
        missing,
        { rates, fx, vol, commodities },
        sources
      );
    }

    return {
      ok: true,
      data: {
        asOf,
        windowDays,
        regime,
        rates,
        fx,
        vol,
        commodities,
        deltas,
        bullets,
        sources,
      },
    };
  },
});
