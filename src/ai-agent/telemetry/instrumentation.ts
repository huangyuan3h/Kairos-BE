import { LangfuseSpanProcessor } from "@langfuse/otel";
import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({});

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();

export function endActiveSpan(): void {
  try {
    trace.getActiveSpan()?.end();
  } catch {
    // no-op: defensive end for environments without an active span
  }
}

export async function forceFlushLangfuse(): Promise<void> {
  try {
    await langfuseSpanProcessor.forceFlush();
  } catch {
    // no-op: best-effort flush in short-lived environments
  }
}

export const instrumentationConfig = {
  experimental_telemetry: {
    isEnabled: true,
  },
  onFinish: async (result: any) => {
    updateActiveObservation({
      output: result.content,
    });
    updateActiveTrace({
      output: result.content,
    });
    endActiveSpan();
  },
};
