import { google } from "@ai-sdk/google";
import {
  startActiveObservation,
  updateActiveObservation,
  updateActiveTrace,
} from "@langfuse/tracing";
import { generateObject, generateText, streamObject, streamText } from "ai";
import { z } from "zod";

import crypto from "crypto";
import {
  endActiveSpan,
  instrumentationConfig,
} from "./telemetry/instrumentation";

// Default schema for object generation when no specific schema is provided
const defaultObjectSchema = z.any();

// Output format types
export type OutputFormat = "text" | "object" | "stream-text" | "stream-object";

// AI Agent configuration
export interface AiAgentConfig {
  model?: string;
  // Native AI SDK tools object: { [toolName]: Tool }
  tools?: Record<string, any>;
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
    tools = {},
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

  // Chat method with different output formats - return the actual result
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    const inputText = messages[messages.length - 1].content;
    const chatId = crypto.randomUUID();
    const userId = crypto.randomUUID(); // TODO: get userId from config

    return await startActiveObservation("ai-sdk-call", async () => {
      updateActiveObservation({ input: inputText });
      updateActiveTrace({
        name: "chat-function",
        sessionId: chatId,
        userId,
        input: inputText,
      });

      const toolsConfig =
        tools &&
        (Array.isArray(tools)
          ? (tools as any)
          : Object.keys(tools as any).length > 0
            ? (tools as Record<string, any>)
            : undefined);

      const commonConfig = {
        model: googleModel,
        messages,
        system: systemPrompt,
        toolChoice,
        schema,
        tools: toolsConfig,
        ...instrumentationConfig,
      };

      let result: any;
      switch (outputFormat) {
        case "stream-text":
          result = await streamText({ ...commonConfig });
          break;
        case "stream-object":
          result = await streamObject({ ...commonConfig } as any);
          break;
        case "object":
          result = await generateObject({ ...commonConfig } as any);
          break;
        case "text":
        default:
          result = await generateText({ ...commonConfig });
          break;
      }

      // For non-streaming calls, record output and end the active span here.
      if (outputFormat === "text" || outputFormat === "object") {
        try {
          const outputText =
            (result as any)?.text ??
            (result as any)?.content ??
            JSON.stringify((result as any)?.object ?? result);
          updateActiveObservation({ output: outputText });
          updateActiveTrace({ output: outputText });
        } finally {
          endActiveSpan();
        }
      }

      return result;
    });
  };

  const generate = async (prompt: string) => {
    const messages = [{ role: "user" as const, content: prompt }];
    return await chat(messages);
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
