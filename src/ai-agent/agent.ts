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
    metadata = {},
  } = config;

  // Create Google AI model instance
  const googleModel = google(model);

  // Helper function to create tool definitions for AI SDK
  const createToolDefinitions = (
    traceId?: string,
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
            const span = langfuse.span({
              name: `tool_execution_${tool.name}`,
              input,
              traceId,
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
    }
  };

  // Chat method with different output formats
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    parentTrace?: any,
  ) => {
    const run = async (trace: any) => {
      const toolDefinitions = createToolDefinitions(trace?.id);
      const langfuse = getLangfuse();

      switch (outputFormat) {
        case "stream-text":
          return streamText({
            model: googleModel,
            messages,
            tools:
              toolDefinitions && Object.keys(toolDefinitions).length > 0
                ? toolDefinitions
                : undefined,
            system: systemPrompt,
          });

        case "stream-object":
          return streamObject({
            model: googleModel,
            messages,
            schema: schema as any,
            system: systemPrompt,
          } as any);

        case "object": {
          const generation = langfuse?.generation({
            name: "model_generation",
            model,
            input: { system: systemPrompt, messages },
            traceId: trace?.id,
            metadata: {
              ...metadata,
              tools: tools.map((t) => t.name),
              outputFormat,
            },
          });
          const result = await generateObject({
            model: googleModel,
            messages,
            schema: schema as any,
            system: systemPrompt,
          } as any);
          try {
            generation?.update({ output: (result as any)?.object ?? result });
          } finally {
            await generation?.end();
          }
          return result;
        }

        case "text":
        default: {
          const generation = langfuse?.generation({
            name: "model_generation",
            model,
            input: { system: systemPrompt, messages },
            traceId: trace?.id,
            metadata: {
              ...metadata,
              tools: tools.map((t) => t.name),
              outputFormat,
            },
          });
          const result = await generateText({
            model: googleModel,
            messages,
            tools:
              toolDefinitions && Object.keys(toolDefinitions).length > 0
                ? toolDefinitions
                : undefined,
            system: systemPrompt,
          });
          try {
            generation?.update({ output: (result as any)?.text ?? result });
          } finally {
            await generation?.end();
          }
          return result;
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

// Example usage with custom schema:
//
// ```typescript
// import { z } from "zod";
// import { createObjectAgentWithSchema } from "@src/ai-agent/agent";
//
// const userSchema = z.object({
//   name: z.string().describe("User's full name"),
//   age: z.number().describe("User's age in years"),
//   email: z.string().email().describe("User's email address"),
// });
//
// const agent = createObjectAgentWithSchema({
//   model: "gemini-2.0-flash-exp",
//   schema: userSchema,
//   systemPrompt: "You are a helpful assistant that extracts user information.",
// });
//
// const result = await agent.generate("Extract info from: John Doe, 30 years old, john@example.com");
// // Result will be: { name: "John Doe", age: 30, email: "john@example.com" }
// ```
