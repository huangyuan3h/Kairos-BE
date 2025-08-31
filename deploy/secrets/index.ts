import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

/**
 * Secrets utilities
 * Centralized helpers to read secrets from AWS Secrets Manager.
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

const client = new SecretsManagerClient({});

const secretCache: Record<string, unknown> = {};

async function getSecretJson<TSecret extends object>(
  secretId: string
): Promise<TSecret> {
  if (secretCache[secretId]) {
    return secretCache[secretId] as TSecret;
  }

  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  if (!result.SecretString) {
    throw new Error(`Secret ${secretId} has no SecretString.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.SecretString);
  } catch (error) {
    throw new Error(`Secret ${secretId} is not valid JSON.`);
  }

  secretCache[secretId] = parsed as TSecret;
  return parsed as TSecret;
}

export async function getGeminiApiKey(): Promise<string> {
  const data = await getSecretJson<{ GOOGLE_GENERATIVE_AI_API_KEY: string }>(
    "prod/gemini"
  );
  if (!data.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY in prod/gemini secret"
    );
  }
  return data.GOOGLE_GENERATIVE_AI_API_KEY;
}

export async function getLangfuseSecrets(): Promise<LangfuseSecrets> {
  const data = await getSecretJson<LangfuseSecrets>("prod/langfuse");
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST } = data;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY || !LANGFUSE_HOST) {
    throw new Error("prod/langfuse secret missing required keys");
  }
  return { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST };
}

export const secrets = {
  getGeminiApiKey,
  getLangfuseSecrets,
};
