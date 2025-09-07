import type { Tool } from "ai";
import { tool as aiTool } from "ai";
import { z } from "zod";

/**
 * Result type returned by all tools. Tools MUST NOT throw.
 */
export type Result<TData, TMeta = unknown> =
  | { ok: true; data: TData; meta?: TMeta }
  | { ok: false; error: string; meta?: TMeta };

/**
 * Tool categories aligned with Overall Report
 */
export enum ToolCategory {
  NEWS = "news",
  MACRO = "macro",
  SECTOR = "sector",
}

/**
 * Plain-object AI Tool contract
 */
// Use AI SDK native Tool type for maximum compatibility
// Align OUTPUT type with actual runtime result shape (Result<TOutput>)
export type AiTool<TInput = unknown, TOutput = unknown> = Tool<
  TInput,
  Result<TOutput>
>;

/**
 * Helper to define a tool with input validation and unified error handling.
 */
export function defineTool<TInput, TOutput>(args: {
  name: string;
  description: string;
  category: ToolCategory; // kept for compatibility, not used by AI SDK
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  handler: (input: TInput) => Promise<Result<TOutput>> | Result<TOutput>;
}): AiTool<TInput, TOutput> {
  const { description, schema, handler } = args;

  // Delegate to AI SDK's `tool` helper; validation still ensured via schema
  return aiTool<TInput, Result<TOutput>>({
    description,
    inputSchema: schema as unknown as any,
    // Execute returns our Result<TOutput> shape which models can read/format
    execute: async (input: TInput) => handler(input),
  }) as AiTool<TInput, TOutput>;
}
