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
  snapshot: {
    rates: {
      UST2Y?: number;
      UST10Y?: number;
      CN_R007?: number;
      CN_MLF?: number;
    };
    fx: { DXY?: number };
    vol: { VIX?: number; VSTOXX?: number };
    commodities: { WTI?: number; GOLD?: number; COPPER?: number };
    deltas: Record<string, number>;
  };
  regime: "RiskOn" | "Neutral" | "RiskOff";
  bullets: string[];
  meta: {
    windowDays: number;
    asOf: string;
    sources?: string[];
  };
};

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

    // =====================================
    // TradingEconomics credentials & client
    // =====================================
    function getTradingEconomicsCred(): string {
      const key = (process.env.TRADINGECONOMICS_API_KEY || "").trim();
      if (key.length > 0) return key;
      return "guest:guest"; // public low-limit guest
    }

    // ======================================
    // CN: Shibor 7D (as R007 proxy) via web
    // ======================================
    async function fetchCnShibor7DFromWeb(): Promise<number | undefined> {
      const urls = [
        "https://www.shibor.org/shibor/",
        "http://www.shibor.org/shibor/",
      ];
      const markers = ["1W", "1周", "一周", "1 Week", "1 week"];

      // Enhanced table matching patterns for various HTML structures
      const tablePatterns = [
        // Standard adjacent TD pattern
        /<td[^>]*>\s*(1W|1周|一周)\s*<\/td>\s*<td[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi,
        // Pattern with more flexible spacing/tags between cells
        /<td[^>]*>\s*(1W|1周|一周)\s*<\/td>[\s\S]*?<td[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi,
        // Alternative: look for class/id patterns containing week data
        /<[^>]*(?:class|id)[^>]*(?:1w|week)[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</gi,
        // Look for TR containing both 1W and a number
        /<tr[^>]*>[\s\S]*?(?:1W|1周|一周)[\s\S]*?([0-9]+(?:\.[0-9]+)?)[\s\S]*?<\/tr>/gi,
      ];

      for (const u of urls) {
        const html = await fetchHtml(u);
        if (!html) continue;

        // Try enhanced table patterns first
        for (const pattern of tablePatterns) {
          pattern.lastIndex = 0; // Reset regex global state
          const matches = Array.from(html.matchAll(pattern));
          for (const match of matches) {
            const rateStr = match[2] || match[1];
            if (rateStr) {
              const v = Number(rateStr);
              if (Number.isFinite(v) && v > 0 && v < 20) return v; // Sanity check for rate range
            }
          }
        }

        // Fallback: nearby number extraction with sanity check
        const v2 = extractNearbyNumber(html, markers);
        if (typeof v2 === "number" && v2 > 0 && v2 < 20) return v2;
      }
      return undefined;
    }

    // ======================================
    // CN: MLF rate via PBOC web (best-effort)
    // ======================================
    async function fetchCnMlfFromPBOCWeb(): Promise<number | undefined> {
      const listUrls = [
        "http://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html",
        "http://www.pbc.gov.cn/english/130721/130922/index.html",
      ];

      // Try list page → detail page approach first
      for (const listUrl of listUrls) {
        const listHtml = await fetchHtml(listUrl);
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
          const detailHtml = await fetchHtml(detailUrl);
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
    async function fetchHtml(url: string): Promise<string | undefined> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000,
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

    function extractNearbyNumber(
      html: string,
      markers: string[],
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

    async function teGetJson(path: string): Promise<any> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000,
      ) as unknown as number;
      try {
        const cred = getTradingEconomicsCred();
        const sep = path.includes("?") ? "&" : "?";
        const url = `https://api.tradingeconomics.com${path}${sep}c=${encodeURIComponent(
          cred,
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
      symbolList: string[],
    ): Promise<Record<string, number>> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000,
      ) as unknown as number;
      try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
          symbolList.join(","),
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
            row.regularMarketPrice ?? row.postMarketPrice ?? row.preMarketPrice,
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
        8000,
      ) as unknown as number;
      try {
        const range = `${windowDays}d`;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          symbol,
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
          (v: any) => typeof v === "number" && Number.isFinite(v),
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
      maxPoints: number,
    ): Promise<{ lastClose?: number; firstClose?: number; delta?: number }> {
      const controller = new AbortControllerCtor();
      const timeout = setTimeoutFn(
        () => controller.abort(),
        8000,
      ) as unknown as number;
      try {
        const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(
          stooqSymbol,
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
          -Math.max(2, Math.min(maxPoints, closes.length)),
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
    async function fetchCnMlfFromTE(): Promise<number | undefined> {
      // Try multiple indicator paths and pick the latest value
      const candidates = [
        "/indicators/China:Medium-term Lending Facility Rate",
        "/indicators/medium-term lending facility rate:China",
        "/indicators/china%20medium-term%20lending%20facility%20rate",
      ];
      for (const path of candidates) {
        const json = await teGetJson(path);
        if (!Array.isArray(json)) continue;
        // Pick the first numeric LatestValue/Value
        for (const row of json) {
          const val = Number(row?.LatestValue ?? row?.Value);
          if (Number.isFinite(val)) return val;
        }
      }
      return undefined;
    }

    async function fetchCnShibor7DFromTE(): Promise<number | undefined> {
      const candidates = [
        "/shibor/7d",
        "/China/shibor 7 day",
        "/China/Interbank%20Rate",
      ];
      for (const path of candidates) {
        const json = await teGetJson(path);
        if (!json) continue;
        const arr = Array.isArray(json) ? json : [json];
        let best: number | undefined;
        for (const row of arr) {
          const desc = String(
            row?.Category || row?.Indicator || row?.shortname || "",
          ).toLowerCase();
          if (!desc.includes("shibor") && !desc.includes("interbank")) continue;
          const v = Number(row?.LatestValue ?? row?.Last ?? row?.Value);
          if (Number.isFinite(v)) {
            best = v;
            break;
          }
        }
        if (typeof best === "number") return best;
      }
      return undefined;
    }

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

    // CN rates via Web first, then TE
    const [cnShiborWeb, cnMlfWeb] = await Promise.all([
      fetchCnShibor7DFromWeb(),
      fetchCnMlfFromPBOCWeb(),
    ]);
    if (rates.CN_R007 == null && typeof cnShiborWeb === "number")
      rates.CN_R007 = cnShiborWeb;
    if (rates.CN_MLF == null && typeof cnMlfWeb === "number")
      rates.CN_MLF = cnMlfWeb;
    if (rates.CN_R007 == null || rates.CN_MLF == null) {
      const [cnMlfTE, cnShiborTE] = await Promise.all([
        rates.CN_MLF == null ? fetchCnMlfFromTE() : Promise.resolve(undefined),
        rates.CN_R007 == null
          ? fetchCnShibor7DFromTE()
          : Promise.resolve(undefined),
      ]);
      if (rates.CN_MLF == null && typeof cnMlfTE === "number") {
        rates.CN_MLF = cnMlfTE;
      }
      if (rates.CN_R007 == null && typeof cnShiborTE === "number") {
        rates.CN_R007 = cnShiborTE;
      }
    }

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
    ].filter(
      (v) => typeof v === "number" && Number.isFinite(v as number),
    ).length;
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
        `${deltas.UST10Y >= 0 ? "Yields rise" : "Yields decline"}; 10Y at ${rates.UST10Y.toFixed(2)}%`,
      );
    }
    if (typeof fx.DXY === "number" && typeof deltas.DXY === "number") {
      bullets.push(
        `USD ${deltas.DXY >= 0 ? "strengthens" : "softens"}; DXY ${fx.DXY.toFixed(1)}`,
      );
    }
    if (typeof vol.VIX === "number") {
      bullets.push(
        `Volatility ${
          typeof deltas.VIX === "number" && deltas.VIX >= 0 ? "up" : "subdued"
        }`,
      );
    }
    if (typeof commodities.WTI === "number" && typeof deltas.WTI === "number") {
      bullets.push(
        `Crude ${deltas.WTI >= 0 ? "rebounds" : "eases"}; WTI $${commodities.WTI.toFixed(1)}`,
      );
    }
    if (bullets.length === 0) {
      bullets.push(
        "Macro snapshot available; insufficient deltas for directionality",
      );
    }

    const snapshot = { rates, fx, vol, commodities, deltas };
    const sources = ["YahooFinance:quote", "YahooFinance:chart"];

    return {
      ok: true,
      data: {
        snapshot,
        regime,
        bullets,
        meta: { windowDays, asOf, sources },
      },
    };
  },
});
