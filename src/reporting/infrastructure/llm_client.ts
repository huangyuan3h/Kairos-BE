import { createAiClient } from "../../ai/client";
import type { OverallReport } from "../domain/types";
import { OverallReportZodSchema } from "../prompts/schema";
import type { LlmClient } from "./contracts";

function buildSystemPrompt(): string {
  return [
    "You are a professional investment research assistant.",
    "Generate a balanced overall market report with opportunities and risks.",
    "Only output valid JSON that matches the provided schema.",
  ].join("\n");
}

function buildUserPrompt(params: {
  asOfDate: string;
  marketScope: string;
  features: unknown;
  headlines: unknown;
}): string {
  return [
    `As of ${params.asOfDate}, market scope: ${params.marketScope}.`,
    "Quant features:",
    JSON.stringify(params.features ?? {}),
    "Headlines:",
    JSON.stringify(params.headlines ?? {}),
    "Return JSON only.",
  ].join("\n");
}

export function createLlmClient(): LlmClient {
  const ai = createAiClient();
  return {
    async generateReport({ asOfDate, marketScope, features, headlines }) {
      const system = buildSystemPrompt();
      const prompt = buildUserPrompt({
        asOfDate,
        marketScope,
        features,
        headlines,
      });
      const object = await ai.generateJson<OverallReport>({
        system,
        prompt,
        schema: OverallReportZodSchema,
      });
      return object;
    },
  };
}
