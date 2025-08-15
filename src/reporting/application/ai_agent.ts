import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import type { OverallReport } from "../domain/types";

// Set environment variable for Gemini API key
if (typeof process !== "undefined") {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

export interface AiAgentConfig {
  geminiApiKey: string;
  model: string;
}

export interface AiAgentTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export class AiAgent {
  private geminiApiKey: string;
  private model: string;
  private tools: Map<string, AiAgentTool> = new Map();

  constructor(config: AiAgentConfig) {
    this.geminiApiKey = config.geminiApiKey;
    this.model = config.model;
  }

  /**
   * Register a tool that the AI agent can use
   */
  registerTool(tool: AiAgentTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get available tools description for prompt
   */
  private getToolsDescription(): string {
    const toolDescriptions = Array.from(this.tools.values()).map(
      (tool) => `- ${tool.name}: ${tool.description}`
    );
    return toolDescriptions.join("\n");
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return await tool.execute(params);
  }

  /**
   * Generate overall report using AI SDK 5
   */
  async generateOverallReport(params: {
    asOfDate: string;
    marketScope: "CN" | "US" | "GLOBAL";
    systemPrompt: string;
  }): Promise<OverallReport> {
    const { asOfDate, marketScope, systemPrompt } = params;

    // Create the full prompt with tools
    const fullPrompt = `${systemPrompt}

## Available Tools
${this.getToolsDescription()}

## Current Context
- Date: ${asOfDate}
- Market Scope: ${marketScope}

Please analyze the market and generate a comprehensive report. You can use the available tools if needed.

## Output Format
Please provide your analysis in the following structure:

1. **Title**: A clear title for the report
2. **Content**: Detailed analysis in Markdown format
3. **Summary**: Brief summary of key findings
4. **Opportunities**: List of investment opportunities
5. **Risks**: List of investment risks

Format your response clearly with proper Markdown headings.`;

    try {
      // Use AI SDK 5 to generate text
      const { text } = await generateText({
        model: google(this.model),
        prompt: fullPrompt,
      });

      // Create a basic report structure from text
      const report: OverallReport = {
        reportId: `REPORT#${marketScope}#OVERALL#${asOfDate}`,
        asOfDate,
        marketScope,
        title: `${marketScope} Market Overall Report - ${asOfDate}`,
        contentMarkdown: text,
        summary: `AI-generated ${marketScope} market analysis for ${asOfDate}`,
        opportunities: [],
        risks: [],
        promptVersion: "ai-sdk-v5",
        modelVersion: this.model,
      };

      return report;
    } catch (error) {
      console.error("AI generation failed:", error);

      // Fallback to basic report
      const report: OverallReport = {
        reportId: `REPORT#${marketScope}#OVERALL#${asOfDate}`,
        asOfDate,
        marketScope,
        title: `${marketScope} Market Overall Report - ${asOfDate}`,
        contentMarkdown: `# ${marketScope} Market Analysis\n\n*Report generation failed. Please check logs for details.*`,
        summary: `Report generation failed for ${marketScope} market on ${asOfDate}`,
        opportunities: [],
        risks: [],
        promptVersion: "ai-sdk-v5-error",
        modelVersion: this.model,
      };

      return report;
    }
  }
}

/**
 * Create AI agent with default configuration
 */
export function createAiAgent(geminiApiKey: string): AiAgent {
  return new AiAgent({
    geminiApiKey,
    model: "gemini-1.5-flash",
  });
}
