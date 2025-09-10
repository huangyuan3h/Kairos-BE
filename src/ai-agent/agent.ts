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
import { getLogger } from "@src/util/logger";

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
    messages: Array<{ role: "user" | "assistant"; content: string }>
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

  // Helper function to create tool definitions for AI SDK with enhanced tracing
  const createToolDefinitions = (): Record<string, any> | undefined => {
    if (!tools || Object.keys(tools).length === 0) return undefined;

    const toolSet: Record<string, any> = {};

    for (const [toolName, tool] of Object.entries(tools)) {
      toolSet[toolName] = {
        ...tool,
        execute: async (input: any) => {
          const toolId = crypto.randomUUID();
          const toolStartTime = Date.now();

          const logger = getLogger("ai-agent/tool");
          logger.debug({ toolName, input }, "Tool called");

          // Start tool execution span
          const toolSpan = await startActiveObservation(
            `tool_execution_${toolName}`,
            async () => {
              updateActiveObservation({
                input,
                metadata: {
                  toolName,
                  toolId,
                  startTime: toolStartTime,
                },
              });

              try {
                // Execute the original tool
                const result = await tool.execute(input);
                const executionTime = Date.now() - toolStartTime;

                logger.info({ toolName, executionTime }, "Tool completed");
                logger.debug({ toolName, result }, "Tool result");

                // Log tool execution details
                updateActiveObservation({
                  output: result,
                  metadata: {
                    toolName,
                    toolId,
                    executionTime,
                    success: true,
                  },
                });

                // Update trace with tool execution info
                updateActiveTrace({
                  metadata: {
                    toolExecutions: {
                      [toolName]: {
                        toolId,
                        input,
                        output: result,
                        executionTime,
                        success: true,
                      },
                    },
                  },
                });

                return result;
              } catch (error) {
                const executionTime = Date.now() - toolStartTime;
                const errorMessage =
                  error instanceof Error ? error.message : String(error);

                logger.error(
                  { toolName, executionTime, error: errorMessage },
                  "Tool failed"
                );

                // Log tool execution error
                updateActiveObservation({
                  output: `error: ${errorMessage}`,
                  metadata: {
                    toolName,
                    toolId,
                    executionTime,
                    success: false,
                    error: errorMessage,
                  },
                });

                // Update trace with tool execution error
                updateActiveTrace({
                  metadata: {
                    toolExecutions: {
                      [toolName]: {
                        toolId,
                        input,
                        output: `error: ${errorMessage}`,
                        executionTime,
                        success: false,
                        error: errorMessage,
                      },
                    },
                  },
                });

                throw error;
              } finally {
                endActiveSpan();
              }
            }
          );

          return toolSpan;
        },
      };
    }

    return toolSet;
  };

  /**
   * Execute all provided tools in parallel and build a compact JSON context.
   * - Calls each tool with an empty input to leverage schema defaults
   * - Trims large arrays (data.items) to first 25 entries with essential fields
   */
  async function buildToolsContext(
    toolsRecord: Record<string, any>
  ): Promise<Record<string, any>> {
    if (!toolsRecord || Object.keys(toolsRecord).length === 0) return {};
    const entries = Object.entries(toolsRecord);
    const pairs = await Promise.all(
      entries.map(async ([toolName, tool]) => {
        try {
          const res = await (tool as any).execute({});
          const data = (res as any)?.data;
          let trimmed = data;
          if (data && Array.isArray((data as any).items)) {
            const items = (data as any).items as Array<any>;
            trimmed = {
              ...data,
              items: items.slice(0, 25).map(it => ({
                title: String(it?.title ?? ""),
                url: it?.url ? String(it.url) : undefined,
                publishedAt: it?.publishedAt
                  ? String(it.publishedAt)
                  : undefined,
                source: it?.source ? String(it.source) : undefined,
                section: it?.section ? String(it.section) : undefined,
              })),
            };
          }
          return [
            toolName,
            { ok: Boolean((res as any)?.ok), data: trimmed ?? undefined },
          ] as [string, any];
        } catch (err: any) {
          return [
            toolName,
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
          ] as [string, any];
        }
      })
    );
    return Object.fromEntries(pairs);
  }

  /**
   * Build provider config for AI SDK calls.
   */
  function buildProviderConfig(
    messagesToSend: Array<{ role: "user" | "assistant"; content: string }>,
    effectiveTools: Record<string, any> | undefined,
    effectiveToolChoice: any
  ): Record<string, any> {
    return {
      model: googleModel,
      messages: messagesToSend,
      system: systemPrompt,
      toolChoice: effectiveToolChoice,
      schema,
      tools: effectiveTools,
      ...instrumentationConfig,
    } as Record<string, any>;
  }

  /**
   * Execute the AI call based on configured output format.
   */
  async function executeByOutputFormat(commonConfig: any): Promise<any> {
    switch (outputFormat) {
      case "stream-text":
        return await streamText({ ...commonConfig });
      case "stream-object":
        return await streamObject({ ...commonConfig } as any);
      case "object":
        return await generateObject({ ...commonConfig } as any);
      case "text":
      default:
        return await generateText({ ...commonConfig });
    }
  }

  // Chat method with different output formats - return the actual result
  const chat = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>
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

      const toolsConfig = createToolDefinitions();

      const shouldUseToolsAsContext =
        outputFormat === "object" || outputFormat === "stream-object";

      // buildToolsContext is declared above for readability

      let messagesToSend = messages;
      let effectiveTools = toolsConfig;
      let effectiveToolChoice: any = toolChoice;

      if (shouldUseToolsAsContext) {
        const toolsContext = await buildToolsContext(tools);
        const contextJson = JSON.stringify({ tools: toolsContext });
        const contextMsg = {
          role: "user" as const,
          content: `Context (JSON):\n\n\`\`\`json\n${contextJson}\n\`\`\``,
        };
        messagesToSend = [contextMsg, ...messages];
        effectiveTools = undefined;
        effectiveToolChoice = "none";
      }

      const commonConfig = buildProviderConfig(
        messagesToSend,
        effectiveTools,
        effectiveToolChoice
      );

      const result = await executeByOutputFormat(commonConfig);

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
  config: Omit<AiAgentConfig, "outputFormat"> = {}
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "text" });
}

// Utility function to create a streaming agent
export function createStreamingAgent(
  config: Omit<AiAgentConfig, "outputFormat"> = {}
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "stream-text" });
}

// Utility function to create an object-generating agent
export function createObjectAgent(
  config: Omit<AiAgentConfig, "outputFormat"> = {}
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "object" });
}

// Utility function to create an object-generating agent with custom schema
export function createObjectAgentWithSchema(
  config: Omit<AiAgentConfig, "outputFormat"> & { schema: z.ZodSchema<any> }
): AiAgent {
  return createAiAgent({ ...config, outputFormat: "object" });
}
