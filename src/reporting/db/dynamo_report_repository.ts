import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ReportRepository } from "../types/contracts";
import type { OverallReport } from "../types/domain";

export function createDynamoReportRepository(params: {
  tableName: string;
}): ReportRepository {
  const client = new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(client);
  const { tableName } = params;

  return {
    async save(report: OverallReport): Promise<void> {
      const pk = `REPORT#OVERALL#${report.marketScope}`;
      const sk = `DATE#${report.asOfDate}`;
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk,
            sk,
            reportId: report.reportId,
            asOfDate: report.asOfDate,
            marketScope: report.marketScope,
            title: report.title ?? `Overall Report ${report.asOfDate}`,
            content_markdown: report.contentMarkdown ?? "",
            summary: report.summary,
            opportunities: report.opportunities,
            risks: report.risks,
            promptVersion: report.promptVersion,
            modelVersion: report.modelVersion,
          },
        }),
      );
    },
  };
}
