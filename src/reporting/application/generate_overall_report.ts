import type { OverallReport } from "../domain/types";
import { createDynamoReportRepository } from "../infrastructure/dynamo_report_repository";
import { createLlmClient } from "../infrastructure/llm_client";
import { createMarketDataReader } from "../infrastructure/marketdata_reader";
import { createNewsProvider } from "../infrastructure/news_provider";

export interface GenerateOverallReportInput {
  asOfDate: string;
  marketScope: "CN" | "US" | "GLOBAL";
  marketDataTableName: string;
  reportsTableName: string;
}

/**
 * Orchestrates the generation of the overall report.
 * This is a placeholder and returns a minimal stub object for now.
 */
export async function generateOverallReport(
  input: GenerateOverallReportInput
): Promise<OverallReport> {
  const { asOfDate, marketScope, marketDataTableName, reportsTableName } =
    input;

  const marketData = createMarketDataReader();
  const news = createNewsProvider();
  const llm = createLlmClient();
  const repo = createDynamoReportRepository({ tableName: reportsTableName });

  const [features, headlines] = await Promise.all([
    marketData.loadFeatures({ asOfDate, marketScope }),
    news.loadHeadlines({ asOfDate, marketScope }),
  ]);

  const draft = await llm.generateReport({
    asOfDate,
    marketScope,
    features,
    headlines,
  });

  const report: OverallReport = {
    ...draft,
    reportId: `REPORT#${marketScope}#OVERALL#${asOfDate}`,
    asOfDate,
    marketScope,
    promptVersion: draft.promptVersion ?? "v1",
  };

  await repo.save(report);

  return report;
}
