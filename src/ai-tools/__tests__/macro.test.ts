import { MacroLiquiditySnapshotTool } from "../macro";

describe("MacroLiquiditySnapshotTool", () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    // Mock fetch to avoid real network and ensure deterministic outputs
    (globalThis as any).fetch = jest.fn(async (input: any) => {
      const url = String(input);
      // Yahoo quote API
      if (url.includes("/v7/finance/quote?")) {
        return {
          ok: true,
          json: async () => ({
            quoteResponse: {
              result: [
                { symbol: "^TNX", regularMarketPrice: 40.86 }, // 4.086%
                { symbol: "DX=F", regularMarketPrice: 97.7 },
                { symbol: "^VIX", regularMarketPrice: 15.2 },
                { symbol: "CL=F", regularMarketPrice: 61.9 },
                { symbol: "XAUUSD=X", regularMarketPrice: 1930.5 },
                { symbol: "HG=F", regularMarketPrice: 4.48 },
                { symbol: "^V2TX", regularMarketPrice: 17.5 },
              ],
            },
          }),
        } as any;
      }
      // Yahoo chart API
      if (url.includes("/v8/finance/chart/")) {
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  indicators: { quote: [{ close: [100, 101] }] },
                },
              ],
            },
          }),
        } as any;
      }
      // Stooq CSV
      if (url.includes("stooq.com/q/d/l/")) {
        return {
          ok: true,
          text: async () =>
            "Date,Open,High,Low,Close,Volume\n2025-09-01,0,0,0,3.50,0\n2025-09-02,0,0,0,3.58,0\n",
        } as any;
      }
      // Chinese sites (not needed for passing the test)
      if (url.includes("shibor.org") || url.includes("pbc.gov.cn")) {
        return { ok: true, text: async () => "" } as any;
      }
      return { ok: true, text: async () => "" } as any;
    });
  });

  afterAll(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it("returns snapshot with regime, bullets and meta", async () => {
    const res = await MacroLiquiditySnapshotTool.execute({ windowDays: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { snapshot, regime, bullets, meta } = res.data;

    expect(["RiskOn", "Neutral", "RiskOff"]).toContain(regime);
    expect(Array.isArray(bullets)).toBe(true);
    expect(typeof meta.asOf).toBe("string");
    expect(typeof meta.windowDays).toBe("number");

    expect(typeof snapshot).toBe("object");
    expect(typeof snapshot.rates).toBe("object");
    expect(typeof snapshot.fx).toBe("object");
    expect(typeof snapshot.vol).toBe("object");
    expect(typeof snapshot.commodities).toBe("object");
    expect(typeof snapshot.deltas).toBe("object");
  });
});
