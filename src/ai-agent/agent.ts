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
  schema: z.ZodSchema<any>;
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
  schema?: z.ZodSchema<any>;
  // Optional user identifier to be attached to traces
  userId?: string;
  // Extra metadata forwarded to traces/observations
  metadata?: Record<string, any>;
  // Force tool calls - 'required' forces at least one tool call, 'auto' allows optional
  toolChoice?:
    | "auto"
    | "required"
    | "none"
    | { type: "tool"; toolName: string };
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
    model = "gemini-2.5-flash",
    tools = [],
    outputFormat = "text",
    systemPrompt = "You are a helpful AI assistant.",
    schema = defaultObjectSchema,
    userId,
    metadata: _unusedMeta = {},
    toolChoice = "auto",
  } = config;

  // Create Google AI model instance
  const googleModel = google(model);

  // Helper function to create tool definitions for AI SDK
  const createToolDefinitions = (
    traceId?: string,
    parentObservationId?: string,
  ): Record<string, any> | undefined => {
    if (tools.length === 0) return undefined;

    // Convert tools array to ToolSet format (Record<string, Tool>)
    const toolSet: Record<string, any> = {};
    tools.forEach((tool) => {
      toolSet[tool.name] = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.schema,
        execute: async (input: any) => {
          const langfuse = getLangfuse();
          if (langfuse) {
            const startTime = new Date();
            const span = langfuse.span({
              name: `tool_execution_${tool.name}`,
              input,
              traceId,
              parentObservationId,
              startTime,
              metadata: { tool: tool.name },
            });
            try {
              const result = await tool.execute(input);
              span.update({
                output: result,
                endTime: new Date(),
              });
              return result;
            } catch (error) {
              span.update({
                output: `error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                endTime: new Date(),
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
    fn: (trace: any) => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> => {
    const langfuse = getLangfuse();
    if (!langfuse) return fn(undefined as any);

    const trace = langfuse.trace({
      name: `ai_agent_${operation}`,
      userId,
      metadata: {
        model,
        outputFormat,
        toolCount: tools.length,
        ...metadata,
      },
    });

    try {
      const result = await fn(trace);
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
      await langfuse.shutdownAsync?.();
    }
  };

  // Chat method with different output formats
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    parentTrace?: any,
  ) => {
    const run = async (trace: any) => {
      const _langfuse = getLangfuse();

      switch (outputFormat) {
        case "stream-text": {
          const toolDefinitions = createToolDefinitions(trace?.id);
          return streamText({
            model: googleModel,
            messages,
            tools:
              toolDefinitions && Object.keys(toolDefinitions).length > 0
                ? toolDefinitions
                : undefined,
            toolChoice,
            system: systemPrompt,
          });
        }

        case "stream-object":
          return streamObject({
            model: googleModel,
            messages,
            schema: schema as any,
            system: systemPrompt,
          } as any);

        case "object":
          return generateObject({
            model: googleModel,
            messages,
            schema: schema as any,
            system: systemPrompt,
          } as any);

        case "text":
        default: {
          const toolDefinitions = createToolDefinitions(trace?.id);
          return generateText({
            model: googleModel,
            messages,
            tools:
              toolDefinitions && Object.keys(toolDefinitions).length > 0
                ? toolDefinitions
                : undefined,
            toolChoice,
            system: systemPrompt,
          });
        }
      }
    };

    if (parentTrace) return run(parentTrace);
    return withTracing("chat", run);
  };

  // Generate method for single prompt
  const generate = async (prompt: string) => {
    return withTracing("generate", async (trace) => {
      const messages = [{ role: "user" as const, content: prompt }];
      return chat(messages, trace);
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

// Utility function to create an object-generating agent with custom schema
export function createObjectAgentWithSchema(
  config: Omit<AiAgentConfig, "outputFormat"> & { schema: z.ZodSchema<any> },
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "object" });
}
