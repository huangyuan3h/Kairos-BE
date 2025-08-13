import { getEnvVar, getStage, getString, isProduction } from "../util/env";

export interface AiConfig {
  provider: "openai"; // extend when adding more
  model: string;
  apiKey: string | undefined;
  stage: string;
  production: boolean;
}

export function loadAiConfig(): AiConfig {
  const provider =
    (getString("MODEL_PROVIDER", "openai") as AiConfig["provider"]) || "openai";
  const model = getString("MODEL_NAME", "gpt-4o-mini");
  const apiKey = getEnvVar<string | undefined>("OPENAI_API_KEY", {
    defaultValue: undefined,
  });
  const stage = getStage();
  const production = isProduction();
  return { provider, model, apiKey, stage, production };
}
