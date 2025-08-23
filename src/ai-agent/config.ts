import { getEnvVar, getStage, getString, isProduction } from "../util/env";

export interface AiConfig {
  provider: "google" | "openai"; // extend when adding more
  model: string;
  apiKey: string | undefined;
  stage: string;
  production: boolean;
}

export function loadAiConfig(): AiConfig {
  const provider =
    (getString("MODEL_PROVIDER", "google") as AiConfig["provider"]) || "google";
  const model = getString("MODEL_NAME", "gemini-2.0-flash-exp");
  const apiKey = getEnvVar<string | undefined>("GEMINI_API_KEY", {
    defaultValue: undefined,
  });
  const stage = getStage();
  const production = isProduction();
  return { provider, model, apiKey, stage, production };
}
