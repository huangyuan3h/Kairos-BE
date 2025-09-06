import { Langfuse } from "langfuse";

let singleton: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (singleton) return singleton;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST;
  if (!publicKey || !secretKey) return null;
  singleton = new Langfuse({ publicKey, secretKey, baseUrl: host });
  return singleton;
}

export async function withTrace<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lf = getLangfuse();
  if (!lf) return fn();
  const trace = lf.trace({ name });
  try {
    const result = await fn();
    trace.update({ output: "success" });
    return result;
  } catch (err: any) {
    trace.update({ output: `error: ${err?.message || String(err)}` });
    throw err;
  } finally {
    // Keep the Langfuse client alive for the process lifetime to allow
    // observations to accumulate and latency to be measured correctly.
  }
}
