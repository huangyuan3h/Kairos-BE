import { google } from "@ai-sdk/google";
import { generateObject, generateText, streamObject, streamText } from "ai";
import { z } from "zod";
import { getLangfuse } from "./telemetry/langfuse";

// Default schema for object generation when no specific schema is provided
const defaultObjectSchema = z.any();

// Tool definition interface
export interface AiTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute: (input: any) => Promise<any>;
}

// Output format types
export type OutputFormat = "text" | "object" | "stream-text" | "stream-object";

// AI Agent configuration
export interface AiAgentConfig {
  model?: string;
  tools?: AiTool[];
  outputFormat?: OutputFormat;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// AI Agent interface
export interface AiAgent {
  chat: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => Promise<any>;
  generate: (prompt: string) => Promise<any>;
}

// Factory function to create AI agent
export function createAiAgent(config: AiAgentConfig = {}): AiAgent {
  const {
    model = "gemini-2.0-flash-exp",
    tools = [],
    outputFormat = "text",
    temperature = 0.7,
    maxTokens = 1000,
    systemPrompt = "You are a helpful AI assistant.",
  } = config;

  // Create Google AI model instance
  const googleModel = google(model);

  // Helper function to create tool definitions for AI SDK
  const createToolDefinitions = (): Record<string, any> | undefined => {
    if (tools.length === 0) return undefined;

    // Convert tools array to ToolSet format (Record<string, Tool>)
    const toolSet: Record<string, any> = {};
    tools.forEach((tool) => {
      toolSet[tool.name] = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (input: any) => {
          const langfuse = getLangfuse();
          if (langfuse) {
            const span = langfuse.span({
              name: `tool_execution_${tool.name}`,
              input,
              metadata: { tool: tool.name },
            });
            try {
              const result = await tool.execute(input);
              span.update({ output: result });
              return result;
            } catch (error) {
              span.update({
                output: `error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              });
              throw error;
            } finally {
              await span.end();
            }
          } else {
            return await tool.execute(input);
          }
        },
      };
    });

    return toolSet;
  };

  // Helper function to handle Langfuse tracing
  const withTracing = async <T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> => {
    const langfuse = getLangfuse();
    if (!langfuse) return fn();

    const trace = langfuse.trace({
      name: `ai_agent_${operation}`,
      metadata: {
        model,
        outputFormat,
        toolCount: tools.length,
        ...metadata,
      },
    });

    try {
      const result = await fn();
      trace.update({ output: "success" });
      return result;
    } catch (error) {
      trace.update({
        output: `error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      throw error;
    } finally {
      // Note: Langfuse trace doesn't have an end method in this version
      // The trace will be automatically finalized when the process ends
    }
  };

  // Chat method with different output formats
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    return withTracing("chat", async () => {
      const toolDefinitions = createToolDefinitions();

      switch (outputFormat) {
        case "stream-text":
          return streamText({
            model: googleModel,
            messages,
            tools: toolDefinitions?.length > 0 ? toolDefinitions : undefined,
            temperature,
            maxOutputTokens: maxTokens,
            system: systemPrompt,
          });

        case "stream-object":
          return streamObject({
            model: googleModel,
            messages,
            schema: defaultObjectSchema as any,
            temperature,
            maxOutputTokens: maxTokens,
            system: systemPrompt,
          } as any);

        case "object":
          return generateObject({
            model: googleModel,
            messages,
            schema: defaultObjectSchema as any,
            temperature,
            maxOutputTokens: maxTokens,
            system: systemPrompt,
          } as any);

        case "text":
        default:
          return generateText({
            model: googleModel,
            messages,
            tools: toolDefinitions?.length > 0 ? toolDefinitions : undefined,
            temperature,
            maxOutputTokens: maxTokens,
            system: systemPrompt,
          });
      }
    });
  };

  // Generate method for single prompt
  const generate = async (prompt: string) => {
    return withTracing("generate", async () => {
      const messages = [{ role: "user" as const, content: prompt }];
      return chat(messages);
    });
  };

  return {
    chat,
    generate,
  };
}

// Utility function to create a simple text-only agent
export function createTextAgent(
  config: Omit<AiAgentConfig, "outputFormat"> = {},
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "text" });
}

// Utility function to create a streaming agent
export function createStreamingAgent(
  config: Omit<AiAgentConfig, "outputFormat"> = {},
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "stream-text" });
}

// Utility function to create an object-generating agent
export function createObjectAgent(
  config: Omit<AiAgentConfig, "outputFormat"> = {},
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "object" });
}
