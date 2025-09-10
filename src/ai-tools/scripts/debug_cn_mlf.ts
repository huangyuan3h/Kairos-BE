#!/usr/bin/env bun
/* eslint-disable no-console */
// bun run src/ai-tools/scripts/debug_cn_mlf.ts
import { fetchCnMlfStandalone } from "..";

async function main() {
  const t0 = Date.now();
  const val = await fetchCnMlfStandalone();
  const ms = Date.now() - t0;
  console.log("CN_MLF:", val ?? "-", "|", ms + "ms");
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
