# Overall Report: Top 3 Tools Plan

Purpose: Define the minimum viable toolset to generate a high–information-density daily overall report in strict Markdown, optimized for short, actionable output. Tools must be simple, reliable, and testable, with clear schemas for future GraphQL integration.

## Design Principles

- Deterministic JSON schemas mapped 1:1 to the report structure (overview, macro bullets, sector strategy, stock table, risks)
- Data-driven, conclusion-first; fail safely with explicit placeholders when sources are unavailable
- Low-latency first hop (<1.5s p95 per tool with caching), provider-agnostic adapter layer
- Clear scoring semantics to support ranking, filtering, and concise reasoning snippets

## Tool 1: News Impact Aggregator (NIA)

Goal: Aggregate top market-moving headlines and compute a normalized impact score to feed “概览” sentences and sector/stock catalysts.

Input (TypeScript/Zod intent):

```ts
{
  marketScope: 'CN' | 'US' | 'GLOBAL';
  topicHints?: string[];            // e.g., ["rates", "AI", "semis"]
  windowHours?: number;             // default: 12
  limit?: number;                   // default: 12 (post-dedupe)
  languages?: ('en'|'zh')[];        // default: ['en','zh']
}
```

Output:

```ts
{
  topHeadlines: Array<{
    id: string; // source+timestamp hash
    source: string; // provider name
    publishedAt: string; // ISO8601
    tickers: string[]; // e.g., ["NVDA", "AMD"]
    sector?: string; // GICS sector if resolvable
    theme?: string; // compact label, e.g., "AI supply chain"
    sentiment: number; // [-1, 1]
    impact: number; // [0, 100], cross-source normalized
    summary: string; // ≤140 chars, declarative
    url?: string;
  }>;
  meta: {
    windowHours: number;
    providerCount: number;
    deduped: number;
  }
}
```

Rules & Scoring:

- Dedupe by URL/title n-gram; cluster similar items; select centroid with max-impact
- Impact = f(sourceWeight, spreadAcrossTickers, pre/post-market timing, abnormal volume proxy)
- Provide at most 2–3 themes; omit if noisy; never exceed `limit`
- Fallback: return empty `topHeadlines` with meta; never throw to the agent

SLOs & Ops:

- p95 latency ≤ 1200 ms with cache key: `{marketScope|language|windowHours}`
- Rate-limit friendly; retries with backoff; circuit-break noisy providers

## Tool 2: Macro & Liquidity Snapshot (MLS)

Goal: Provide compact macro bullets and a regime classification to drive “宏观环境（3–5条）”。

Input:

```ts
{
  marketScope: 'CN' | 'US' | 'GLOBAL';
  indicators?: Array<
    'UST2Y'|'UST10Y'|'DXY'|'VIX'|'WTI'|'GOLD'|'COPPER'|'CN_R007'|'CN_MLF'|'EUROSTOXX_VSTOXX'
  >;                                 // default: curated set by scope
  windowDays?: number;               // default: 7 (for delta computation)
}
```

Output:

```ts
{
  snapshot: {
    rates: { UST2Y?: number; UST10Y?: number; CN_R007?: number; CN_MLF?: number };
    fx: { DXY?: number };
    vol: { VIX?: number; VSTOXX?: number };
    commodities: { WTI?: number; GOLD?: number; COPPER?: number };
    deltas: Record<string, number>;   // 7D change where applicable
  };
  regime: 'RiskOn' | 'Neutral' | 'RiskOff';
  bullets: string[];                  // 3–5 concise conclusions with direction (↑/↓)
}
```

Rules:

- Compute direction via short-window deltas; attach concise arrow markers
- Map snapshot to regime with simple rules-first model (transparent thresholds)
- Prefer breadth and liquidity proxies over exhaustive lists; keep 3–5 bullets
- Fallback: if <3 indicators available, still return best-effort bullets and `regime: Neutral`

## Tool 3: Sector Rotation & Valuation (SRV)

Goal: Rank 1–2 sectors and produce 3 stock candidates per sector for the Markdown table.

Input:

```ts
{
  marketScope: 'CN' | 'US' | 'GLOBAL';
  candidateSectors?: string[];       // optional allowlist; default: top by breadth
  lookbackDays?: number;              // default: 20
}
```

Output:

```ts
{
  sectors: Array<{
    name: string; // e.g., "Semiconductors"
    scores: {
      momentum20d: number; // z-score
      valuationRel: number; // z-score vs market
      revisionBreadth: number; // [-1,1]
      fundFlow: number; // normalized [0,100]
    };
    catalysts: string[]; // ≤2 short phrases
    picks: Array<{
      ticker: string;
      name?: string;
      advice: "买入" | "持有" | "卖出";
      targetPrice?: { min?: number; max?: number; currency: string };
      timeframe: "短期(1-3M)" | "中期(3-6M)" | "中长期(6-12M)";
      logic: string; // one-factor primary driver, ≤12 chars
      technical: string; // one confirmation, ≤12 chars
      risk: string; // one key risk, ≤12 chars
    }>;
  }>; // return 1–2 sectors, 3 picks each
}
```

Rules:

- Restrict to 1–2 sectors (highest composite score); 3 picks per sector
- Enforce brevity on `logic/technical/risk` to fit table cells
- If target price unknown, use "—"; currency must be present when price exists
- Fallback: if no high-confidence sector, return one sector with placeholders and a reason

## Cross-Cutting Concerns

- Validation: All inputs validated with Zod; descriptive errors for the caller, never thrown to the agent
- Caching: Keyed by scope & lookback; invalidation on provider freshness windows
- Observability: Emit timings, provider hit/miss, and scoring breakdown (debug)
- Testability: Deterministic fixtures; provider adapters mocked by interface
- Security: Respect provider ToS; sanitize/whitelist URLs; redact PII

## Minimal Examples

NIA example (truncated):

```json
{
  "topHeadlines": [
    {
      "id": "reuters-...",
      "source": "Reuters",
      "publishedAt": "2025-01-10T12:30:00Z",
      "tickers": ["NVDA"],
      "sector": "Information Technology",
      "theme": "AI supply chain",
      "sentiment": 0.35,
      "impact": 78,
      "summary": "Nvidia guides above consensus on datacenter strength",
      "url": "https://..."
    }
  ],
  "meta": { "windowHours": 12, "providerCount": 2, "deduped": 5 }
}
```

MLS example (truncated):

```json
{
  "snapshot": {
    "rates": { "UST2Y": 4.21, "UST10Y": 3.98 },
    "fx": { "DXY": 103.2 },
    "vol": { "VIX": 13.4 },
    "commodities": { "WTI": 76.3, "GOLD": 2042 },
    "deltas": { "UST10Y": -0.05, "DXY": 0.4 }
  },
  "regime": "Neutral",
  "bullets": ["收益率下行，美元走稳（↑）", "波动率低位徘徊"]
}
```

SRV example (truncated):

```json
{
  "sectors": [
    {
      "name": "Semiconductors",
      "scores": {
        "momentum20d": 1.1,
        "valuationRel": 0.6,
        "revisionBreadth": 0.4,
        "fundFlow": 72
      },
      "catalysts": ["AI capex", "inventory draw"],
      "picks": [
        {
          "ticker": "NVDA",
          "advice": "买入",
          "targetPrice": { "min": 550, "max": 650, "currency": "USD" },
          "timeframe": "中长期(6-12M)",
          "logic": "AI需求",
          "technical": "均线多头",
          "risk": "供应瓶颈"
        },
        {
          "ticker": "AMD",
          "advice": "持有",
          "timeframe": "中期(3-6M)",
          "logic": "GPU渗透",
          "technical": "突破确认",
          "risk": "竞争压力"
        },
        {
          "ticker": "ASML",
          "advice": "持有",
          "timeframe": "中长期(6-12M)",
          "logic": "设备周期",
          "technical": "趋势线上",
          "risk": "订单波动"
        }
      ]
    }
  ]
}
```

## Integration Notes

- Category mapping: `NIA -> 概览/催化`, `MLS -> 宏观环境`, `SRV -> 板块策略 & 个股表格`
- Keep agent prompt stable; tools only populate structured fields and short reasoning phrases
- Start with mock providers; swap in real providers behind adapter interfaces without schema changes
