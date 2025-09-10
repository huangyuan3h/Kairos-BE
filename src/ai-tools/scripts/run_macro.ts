#!/usr/bin/env bun
/* eslint-disable no-console */
// bun run src/ai-tools/scripts/run_macro.ts
import { MacroLiquiditySnapshotTool } from "..";
import type { Result } from "../base";
import type { MacroSnapshotOutput } from "../macro";

function parseArgs(): { windowDays: number } {
  const windowDays = Number(process.argv[2] ?? 7);
  return { windowDays: Number.isFinite(windowDays) ? windowDays : 7 };
}

function formatNumber(n: number | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? n.toString() : "-";
}

async function main() {
  const args = parseArgs();
  const res = (await (MacroLiquiditySnapshotTool as any).execute(
    {
      windowDays: args.windowDays,
    },
    {}
  )) as Result<MacroSnapshotOutput>;

  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }

  const {
    asOf,
    windowDays,
    rates,
    fx,
    vol,
    commodities,
    deltas,
    regime,
    bullets,
  } = res.data;
  console.log("=== MacroLiquiditySnapshotTool Result ===");
  console.log(`AsOf: ${asOf} | WindowDays: ${windowDays}`);
  console.log(`Regime: ${regime}`);
  console.log("");

  console.log("[Rates]");
  console.log(`  UST2Y: ${formatNumber(rates.UST2Y)}%`);
  console.log(`  UST10Y: ${formatNumber(rates.UST10Y)}%`);
  console.log(`  CN_R007: ${formatNumber(rates.CN_R007)}%`);
  console.log(`  CN_MLF: ${formatNumber(rates.CN_MLF)}%`);

  console.log("[FX]");
  console.log(`  DXY: ${formatNumber(fx.DXY)}`);

  console.log("[Vol]");
  console.log(`  VIX: ${formatNumber(vol.VIX)}`);
  console.log(`  VSTOXX: ${formatNumber(vol.VSTOXX)}`);

  console.log("[Commodities]");
  console.log(`  WTI: ${formatNumber(commodities.WTI)}`);
  console.log(`  GOLD: ${formatNumber(commodities.GOLD)}`);
  console.log(`  COPPER: ${formatNumber(commodities.COPPER)}`);

  console.log("");
  console.log("[Deltas]");
  const entries = Object.entries(deltas ?? {});
  if (entries.length === 0) console.log("  (none)");
  for (const [k, v] of entries) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("");
  console.log("[Bullets]");
  for (const line of bullets) console.log(`  - ${line}`);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
