import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Secrets utilities
 * Centralized helpers to read secrets from AWS SSM Parameter Store.
 *
 * Design considerations:
 * - Explicit, typed getters for each secret used by the app
 * - Caches results in-memory to avoid repeated network calls during deploy
 * - Throws descriptive errors to simplify troubleshooting
 */

type LangfuseSecrets = {
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_HOST: string;
};

const client = new SSMClient({});

const secretCache: Record<string, unknown> = {};

async function getParameterJson<TSecret extends object>(
  name: string
): Promise<TSecret> {
  if (secretCache[name]) {
    return secretCache[name] as TSecret;
  }

  const result = await client.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );

  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${name} has no value.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`SSM parameter ${name} is not valid JSON.`);
  }

  secretCache[name] = parsed as TSecret;
  return parsed as TSecret;
}

export async function getGeminiApiKey(): Promise<string> {
  const data = await getParameterJson<{ GOOGLE_GENERATIVE_AI_API_KEY: string }>(
    "gemini"
  );
  if (!data.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY in 'gemini' parameter");
  }
  return data.GOOGLE_GENERATIVE_AI_API_KEY;
}

export async function getLangfuseSecrets(): Promise<LangfuseSecrets> {
  const data = await getParameterJson<LangfuseSecrets>("langfuse");
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST } = data;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY || !LANGFUSE_HOST) {
    throw new Error("'langfuse' parameter missing required keys");
  }
  return { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST };
}

export const secrets = {
  getGeminiApiKey,
  getLangfuseSecrets,
};
