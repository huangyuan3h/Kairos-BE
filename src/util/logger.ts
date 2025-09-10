import pino, { Logger, LoggerOptions } from "pino";
import { getStage, isLocal, isProduction } from "./env";

/**
 * Centralized structured logger for both local dev and AWS Lambda.
 * - Local/dev: pretty-printed logs for readability
 * - Lambda/prod: JSON logs optimized for CloudWatch and log analysis
 */
const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (isProduction() ? "info" : "debug"),
  base: {
    service: "kairos-be",
    stage: getStage(),
  },
  redact: {
    // Remove sensitive fields from logs
    paths: [
      "*.password",
      "*.secret",
      "*.token",
      "*.apiKey",
      "headers.authorization",
    ],
    remove: true,
  },
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
};

const transport =
  isLocal() && !isProduction()
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          singleLine: false,
          ignore: "pid,hostname",
        },
      }
    : undefined;

const rootLogger: Logger = pino({ ...baseOptions, transport } as LoggerOptions);

/**
 * Returns a child logger with module-scoped bindings.
 */
export function getLogger(moduleName?: string): Logger {
  if (!moduleName) return rootLogger;
  return rootLogger.child({ module: moduleName });
}

/**
 * Returns a child logger augmented with AWS Lambda request context fields.
 * Use inside Lambda handlers when `context` is available.
 */
export function withRequestContext(
  moduleName: string | undefined,
  request: {
    awsRequestId?: string;
    functionName?: string;
    functionVersion?: string;
  }
): Logger {
  return getLogger(moduleName).child({
    requestId: request.awsRequestId,
    functionName: request.functionName,
    functionVersion: request.functionVersion,
  });
}

export default rootLogger;
