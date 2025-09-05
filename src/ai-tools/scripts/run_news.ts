#!/usr/bin/env bun

import { NewsImpactTool } from "..";

type Scope = "US" | "CN" | "GLOBAL";

function parseArgs(): {
  marketScope: Scope;
  windowHours: number;
  limit: number;
  topicHints?: string[];
} {
  const scopeArg = (process.argv[2] ?? "US").toUpperCase();
  const marketScope = ["US", "CN", "GLOBAL"].includes(scopeArg)
    ? (scopeArg as Scope)
    : "US";
  const windowHours = Number(process.argv[3] ?? 24);
  const limit = Number(process.argv[4] ?? 5);
  const topicHints = process.argv.slice(5);
  return {
    marketScope,
    windowHours: Number.isFinite(windowHours) ? windowHours : 24,
    limit: Number.isFinite(limit) ? limit : 5,
    topicHints: topicHints.length > 0 ? topicHints : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const result = await NewsImpactTool.execute(args);
  if (!result.ok) {
    console.error("Error:", result.error);
    process.exit(1);
  }
  const { topHeadlines, meta } = result.data;

  console.log("=== NewsImpactTool Result ===");
  console.log(
    `Scope: ${args.marketScope} | Window: ${args.windowHours}h | Limit: ${args.limit}`,
  );
  if (args.topicHints?.length) {
    console.log(`Topic Hints: ${args.topicHints.join(", ")}`);
  }
  console.log(`Providers: ${meta.providerCount} | Deduped: ${meta.deduped}`);
  console.log("");

  if (topHeadlines.length === 0) {
    console.log("No headlines.");
    return;
  }

  for (const [i, h] of topHeadlines.entries()) {
    console.log(
      `${i + 1}. [${h.impact}] ${h.source} | ${h.publishedAt}\n   ${h.summary}`,
    );
    if (h.url) console.log(`   ${h.url}`);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
