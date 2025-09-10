#!/usr/bin/env bun
/* eslint-disable no-console */
// bun run src/ai-tools/scripts/run_google_news.ts

import { GoogleNewsTool } from "..";
import type { Result } from "../base";
import type { GoogleNewsOutput } from "../google-news";

function parseArgs(): {
  windowHours: number;
  limit: number;
} {
  const windowHours = Number(process.argv[2] ?? 24);
  const limit = Number(process.argv[3] ?? 10);
  return {
    windowHours: Number.isFinite(windowHours) ? windowHours : 24,
    limit: Number.isFinite(limit) ? limit : 10,
  };
}

async function main() {
  const args = parseArgs();
  const result = (await (GoogleNewsTool as any).execute(
    {
      windowHours: args.windowHours,
      limit: args.limit,
    },
    {}
  )) as Result<GoogleNewsOutput>;
  if (!result.ok) {
    console.error("Error:", result.error);
    process.exit(1);
  }

  const { items, meta } = result.data;
  console.log("=== GoogleNewsTool Result ===");
  console.log(`Window: ${meta.windowHours}h | Feeds: ${meta.feedCount}`);
  console.log(`Fetched: ${meta.fetched} | Deduped: ${meta.deduped}`);
  console.log("");

  if (items.length === 0) {
    console.log("No items.");
    return;
  }

  for (const [i, it] of items.entries()) {
    console.log(`${i + 1}. ${it.publishedAt} | ${it.source}`);
    console.log(`   ${it.title}`);
    if (it.url) console.log(`   ${it.url}`);
  }
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
