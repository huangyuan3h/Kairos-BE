#!/usr/bin/env bun
/* eslint-disable no-console */
// bun run src/ai-tools/scripts/debug_vstoxx.ts [windowDays]
import { fetchVstoxxStandalone } from "..";

function parseArgs(): { windowDays: number } {
  const n = Number(process.argv[2] ?? 7);
  return { windowDays: Number.isFinite(n) ? n : 7 };
}

async function main() {
  const { windowDays } = parseArgs();
  const t0 = Date.now();
  const out = await fetchVstoxxStandalone(windowDays, true);
  const ms = Date.now() - t0;
  console.log(
    "VSTOXX:",
    (out.value ?? "-") + " (Δ=" + (out.delta ?? "-") + ")",
    "|",
    ms + "ms",
  );
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
