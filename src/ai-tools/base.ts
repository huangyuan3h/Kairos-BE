import { z } from "zod";

/**
 * Simple AI Tool interface
 */
export interface AiTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute: (input: any) => Promise<any>;
}

/**
 * Tool categories for organization
 */
export enum ToolCategory {
  MARKET_DATA = "market_data",
  NEWS_ANALYSIS = "news_analysis",
}

/**
 * Base class for AI tools with common functionality
 */
export abstract class BaseAiTool implements AiTool {
  abstract name: string;
  abstract description: string;
  abstract category: ToolCategory;
  abstract inputSchema: z.ZodSchema<any>;

  async execute(input: any): Promise<any> {
    try {
      const validatedInput = this.inputSchema.parse(input);
      return await this.executeImpl(validatedInput);
    } catch (error) {
      throw new Error(
        `Tool "${this.name}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  protected abstract executeImpl(input: any): Promise<any>;
}
