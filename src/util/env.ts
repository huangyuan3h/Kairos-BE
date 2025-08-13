/**
 * Environment utilities for runtime/stage detection and safe env var access.
 */

export function getNodeEnv(): string {
  return process.env.NODE_ENV || "development";
}

export function getStage(): string {
  // Prefer SST stage when available; fall back to explicit STAGE; derive from NODE_ENV otherwise
  const sstStage = process.env.SST_STAGE || process.env.STAGE;
  if (sstStage && sstStage.length > 0) return sstStage;
  return getNodeEnv() === "production" ? "prod" : "dev";
}

export function isProduction(): boolean {
  const stage = getStage();
  return stage === "prod" || getNodeEnv() === "production";
}

export function isLocal(): boolean {
  // Heuristics: SST dev flags or absence of Lambda execution env implies local
  const sstDev =
    process.env.SST_DEV === "true" || process.env.IS_LOCAL === "true";
  const isLambda = Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV
  );
  return sstDev || !isLambda;
}

export interface GetEnvVarOptions<T> {
  defaultValue?: T;
  required?: boolean;
  parse?: (raw: string) => T;
  stageAware?: boolean; // if true, prefer NAME__<stage> before NAME
}

/**
 * Reads an environment variable with sensible fallbacks and optional parsing.
 * - If `stageAware` is true, checks NAME__<stage> first (e.g., OPENAI_API_KEY__prod), then NAME.
 * - If not found, returns `defaultValue` when provided; otherwise throws when `required` is true.
 */
export function getEnvVar<T = string>(
  name: string,
  options: GetEnvVarOptions<T> = {}
): T {
  const stage = getStage();
  const stageKey = `${name}__${stage}`;
  const stageAware = options.stageAware !== false; // default true

  const candidate = stageAware
    ? process.env[stageKey] ?? process.env[name]
    : process.env[name];

  if (candidate != null && candidate !== "") {
    const parser = options.parse as ((raw: string) => T) | undefined;
    return parser ? parser(candidate) : (candidate as unknown as T);
  }

  if (Object.prototype.hasOwnProperty.call(options, "defaultValue")) {
    return options.defaultValue as T;
  }

  if (options.required) {
    const tried = stageAware ? `${stageKey} or ${name}` : name;
    throw new Error(`Missing required env var: ${tried}`);
  }

  return undefined as unknown as T;
}

export function getString(name: string, defaultValue?: string): string {
  return getEnvVar<string>(name, { defaultValue });
}

export function getNumber(name: string, defaultValue?: number): number {
  return getEnvVar<number>(name, {
    defaultValue,
    parse: (raw) => {
      const n = Number(raw);
      if (Number.isNaN(n))
        throw new Error(`Env var ${name} is not a number: ${raw}`);
      return n;
    },
  });
}

export function getBoolean(name: string, defaultValue?: boolean): boolean {
  return getEnvVar<boolean>(name, {
    defaultValue,
    parse: (raw) => {
      const lowered = raw.toLowerCase();
      if (["1", "true", "yes", "y"].includes(lowered)) return true;
      if (["0", "false", "no", "n"].includes(lowered)) return false;
      throw new Error(`Env var ${name} is not a boolean: ${raw}`);
    },
  });
}
