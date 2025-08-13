import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { loadAiConfig } from "./config";

export interface GenerateJsonParams<TSchema extends z.ZodTypeAny> {
  system: string;
  prompt: string;
  schema: TSchema;
}

export interface AiClient {
  generateJson<T>(params: GenerateJsonParams<z.ZodTypeAny>): Promise<T>;
}

export function createAiClient(): AiClient {
  const cfg = loadAiConfig();

  if (cfg.provider === "openai") {
    const provider = createOpenAI({ apiKey: cfg.apiKey });
    return {
      async generateJson<T>({
        system,
        prompt,
        schema,
      }: GenerateJsonParams<z.ZodTypeAny>): Promise<T> {
        const { object } = await generateObject({
          model: provider(cfg.model),
          system,
          prompt,
          schema,
        });
        return object as T;
      },
    };
  }

  throw new Error(`Unsupported AI provider: ${cfg.provider}`);
}
