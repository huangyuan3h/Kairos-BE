import { LangfuseSpanProcessor } from "@langfuse/otel";
import { updateActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const langfuseSpanProcessor = new LangfuseSpanProcessor({});

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();

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
  },
};
