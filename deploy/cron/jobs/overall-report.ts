/// <reference path="../../.sst/platform/config.d.ts" />

export function createOverallReportCron(params: {
  database: { marketDataTable: any; reportsTable: any };
  geminiApiKey: string;
  langfuse: { LANGFUSE_PUBLIC_KEY: string; LANGFUSE_SECRET_KEY: string; LANGFUSE_HOST: string };
}) {
  const { database, geminiApiKey, langfuse } = params;

  const overallReport = new sst.aws.Cron("GenerateOverallReport", {
    // Runs at 10:00 UTC (18:00 China time) every day
    schedule: "cron(0 10 * * ? *)",
    function: {
      handler: "functions/nodejs/overall_report.handler",
      runtime: "nodejs20.x",
      timeout: "15 minutes",
      memory: "1024 MB",
      link: [database.marketDataTable, database.reportsTable],
      environment: {
        STAGE: $app.stage,
        GOOGLE_GENERATIVE_AI_API_KEY: geminiApiKey,
        LANGFUSE_PUBLIC_KEY: langfuse.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: langfuse.LANGFUSE_SECRET_KEY,
        LANGFUSE_BASE_URL: langfuse.LANGFUSE_HOST,
      },
    },
  });

  return overallReport;
}
