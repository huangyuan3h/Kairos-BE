import { google } from "@ai-sdk/google";
import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { generateObject, generateText, streamObject, streamText } from "ai";
import { z } from "zod";

import crypto from "crypto";
import { instrumentationConfig } from "./telemetry/instrumentation";

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
  tools?: AiTool[]; // todo: change to native type
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
}

// Factory function to create AI agent
export function createAiAgent(config: AiAgentConfig = {}): AiAgent {
  const {
    model = "gemini-2.5-flash",
    // tools = [],
    outputFormat = "text",
    systemPrompt = "You are a helpful AI assistant.",
    schema = defaultObjectSchema,
    toolChoice = "auto",
  } = config;

  // Create Google AI model instance
  const googleModel = google(model);

  // Helper function to create tool definitions for AI SDK
  // const createToolDefinitions = (): Record<string, any> | undefined => {
  //   if (tools.length === 0) return undefined;

  //   // Convert tools array to ToolSet format (Record<string, Tool>)
  //   const toolSet: Record<string, any> = {};
  //   tools.forEach((tool) => {
  //     toolSet[tool.name] = {
  //       name: tool.name,
  //       description: tool.description,
  //       inputSchema: tool.schema,
  //       execute: async (input: any) => {
  //         return await tool.execute(input);
  //       },
  //     };
  //   });

  //   return toolSet;
  // };

  // Chat method with different output formats
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    const run = async () => {
      const inputText = messages[messages.length - 1].content;
      const chatId = crypto.randomUUID();
      const userId = crypto.randomUUID(); // TODO: get userId from config
      updateActiveObservation({
        input: inputText,
      });

      updateActiveTrace({
        name: "chat-function",
        sessionId: chatId,
        userId,
        input: inputText,
      });

      const commonConfig = {
        model: googleModel,
        messages,
        system: systemPrompt,
        toolChoice,
        schema,
        // tools,
        ...instrumentationConfig,
      };

      switch (outputFormat) {
        case "stream-text": {
          return streamText({
            ...commonConfig,
          });
        }

        case "stream-object":
          return streamObject({
            ...commonConfig,
          } as any);

        case "object":
          return generateObject({
            ...commonConfig,
          } as any);

        case "text":
        default: {
          return generateText({
            ...commonConfig,
          });
        }
      }
    };

    return run;
  };

  return {
    chat,
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
