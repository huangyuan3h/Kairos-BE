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
export interface AiTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  execute: (input: unknown) => Promise<Result<TOutput>>;
}

/**
 * Helper to define a tool with input validation and unified error handling.
 */
export function defineTool<TInput, TOutput>(args: {
  name: string;
  description: string;
  category: ToolCategory;
  schema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  handler: (input: TInput) => Promise<Result<TOutput>> | Result<TOutput>;
}): AiTool<TInput, TOutput> {
  const { name, description, category, schema, handler } = args;

  return {
    name,
    description,
    category,
    schema,
    async execute(input: unknown): Promise<Result<TOutput>> {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Invalid input for ${name}: ${parsed.error.message}`,
        };
      }
      try {
        const result = await handler(parsed.data);
        return result;
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
