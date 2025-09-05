#!/usr/bin/env bun
/* eslint-disable no-console */

import { NewsImpactTool } from "..";

type Scope = "US" | "CN" | "GLOBAL";

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function sanitizeSnippet(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<br\s*\/?>(\r?\n)?/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArgs(): {
  marketScope: Scope;
  windowHours: number;
  limit: number;
  previewTopN?: number;
  previewTimeoutMs?: number;
  previewMaxChars?: number;
  topicHints?: string[];
} {
  const scopeArg = (process.argv[2] ?? "US").toUpperCase();
  const marketScope = ["US", "CN", "GLOBAL"].includes(scopeArg)
    ? (scopeArg as Scope)
    : "US";
  const windowHours = Number(process.argv[3] ?? 24);
  const limit = Number(process.argv[4] ?? 5);
  const maybePreviewTopN = Number(process.argv[5]);
  const hasPreviewTopN = Number.isFinite(maybePreviewTopN);
  const previewTopN = hasPreviewTopN ? maybePreviewTopN : undefined;
  const previewTimeoutMs = hasPreviewTopN
    ? Number(process.argv[6] ?? 3000)
    : undefined;
  const previewMaxChars = hasPreviewTopN
    ? Number(process.argv[7] ?? 160)
    : undefined;
  const topicHints = process.argv.slice(hasPreviewTopN ? 8 : 5);
  return {
    marketScope,
    windowHours: Number.isFinite(windowHours) ? windowHours : 24,
    limit: Number.isFinite(limit) ? limit : 5,
    previewTopN,
    previewTimeoutMs,
    previewMaxChars,
    topicHints: topicHints.length > 0 ? topicHints : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const result = await NewsImpactTool.execute({
    marketScope: args.marketScope,
    windowHours: args.windowHours,
    limit: args.limit,
    topicHints: args.topicHints,
    previewTopN: args.previewTopN ?? 2,
    previewTimeoutMs: args.previewTimeoutMs ?? 3000,
    previewMaxChars: args.previewMaxChars ?? 160,
  });
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
  if (args.previewTopN !== undefined) {
    console.log(
      `Preview: top ${args.previewTopN ?? 2}, timeout ${args.previewTimeoutMs ?? 3000}ms, max ${args.previewMaxChars ?? 160} chars`,
    );
  } else {
    console.log("Preview: top 2 (default), 3000ms, 160 chars");
  }
  console.log(`Providers: ${meta.providerCount} | Deduped: ${meta.deduped}`);
  console.log("");

  if (topHeadlines.length === 0) {
    console.log("No headlines.");
    return;
  }

  for (const [i, h] of topHeadlines.entries()) {
    const summary = sanitizeSnippet(h.summary);
    console.log(
      `${i + 1}. [${h.impact}] ${h.source} | ${h.publishedAt}\n   ${summary}`,
    );
    if (h.url) console.log(`   ${h.url}`);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
