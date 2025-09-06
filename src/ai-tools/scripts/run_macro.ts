#!/usr/bin/env bun
/* eslint-disable no-console */

import { MacroLiquiditySnapshotTool } from "..";

function parseArgs(): { windowDays: number } {
  const windowDays = Number(process.argv[2] ?? 7);
  return { windowDays: Number.isFinite(windowDays) ? windowDays : 7 };
}

function formatNumber(n: number | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? n.toString() : "-";
}

async function main() {
  const args = parseArgs();
  const res = await MacroLiquiditySnapshotTool.execute({
    windowDays: args.windowDays,
  });

  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }

  const { snapshot, regime, bullets, meta } = res.data;
  console.log("=== MacroLiquiditySnapshotTool Result ===");
  console.log(`AsOf: ${meta.asOf} | WindowDays: ${meta.windowDays}`);
  console.log(`Regime: ${regime}`);
  console.log("");

  console.log("[Rates]");
  console.log(`  UST2Y: ${formatNumber(snapshot.rates.UST2Y)}%`);
  console.log(`  UST10Y: ${formatNumber(snapshot.rates.UST10Y)}%`);
  console.log(`  CN_R007: ${formatNumber(snapshot.rates.CN_R007)}%`);
  console.log(`  CN_MLF: ${formatNumber(snapshot.rates.CN_MLF)}%`);

  console.log("[FX]");
  console.log(`  DXY: ${formatNumber(snapshot.fx.DXY)}`);

  console.log("[Vol]");
  console.log(`  VIX: ${formatNumber(snapshot.vol.VIX)}`);
  console.log(`  VSTOXX: ${formatNumber(snapshot.vol.VSTOXX)}`);

  console.log("[Commodities]");
  console.log(`  WTI: ${formatNumber(snapshot.commodities.WTI)}`);
  console.log(`  GOLD: ${formatNumber(snapshot.commodities.GOLD)}`);
  console.log(`  COPPER: ${formatNumber(snapshot.commodities.COPPER)}`);

  console.log("");
  console.log("[Deltas]");
  const entries = Object.entries(snapshot.deltas ?? {});
  if (entries.length === 0) console.log("  (none)");
  for (const [k, v] of entries) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("");
  console.log("[Bullets]");
  for (const line of bullets) console.log(`  - ${line}`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
