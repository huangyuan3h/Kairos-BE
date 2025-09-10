#!/usr/bin/env bun
/* eslint-disable no-console */
// bun run src/ai-tools/scripts/debug_cn_r007.ts
import { fetchCnR007Standalone } from "..";

async function main() {
  const t0 = Date.now();
  const val = await fetchCnR007Standalone(true);
  const ms = Date.now() - t0;
  console.log("CN_R007:", val ?? "-", "|", ms + "ms");
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
