import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ReportRepository } from "../types/contracts";
import type { OverallReport, ReportSummary } from "../types/domain";

export function createDynamoReportRepository(params: {
  tableName: string;
}): ReportRepository {
  const client = new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(client);
  const { tableName } = params;

  return {
    async save(report: OverallReport): Promise<void> {
      const pk = `REPORT#OVERALL`;
      const sk = `DATE#${report.asOfDate}`;
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk,
            sk,
            reportId: report.reportId,
            asOfDate: report.asOfDate,
            title: report.title,
            content: report.content,
            createdAt: report.createdAt,
          },
        }),
      );
    },

    async findByType(params: {
      type: string;
      currentPage: number;
      pageSize: number;
    }): Promise<{
      reports: OverallReport[];
      totalCount: number;
      currentPage: number;
      pageSize: number;
      totalPages: number;
    }> {
      const { type, currentPage, pageSize } = params;

      // For now, only support "overall" type
      if (type !== "overall") {
        throw new Error(`Unsupported report type: ${type}`);
      }

      const pk = `REPORT#OVERALL`;

      // Calculate pagination
      const limit = pageSize;

      try {
        // Query for reports with pagination
        const queryCommand = new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: {
            ":pk": pk,
          },
          ScanIndexForward: false, // Sort by sort key in descending order (newest first)
          Limit: limit,
        });

        const result = await doc.send(queryCommand);

        // Convert DynamoDB items to OverallReport objects
        const reports: OverallReport[] = (result.Items || []).map(
          (item: any) => ({
            reportId: item.reportId,
            asOfDate: item.asOfDate,
            title: item.title,
            content: item.content,
            createdAt: item.createdAt,
          }),
        );

        // For simplicity, we'll use the count of returned items as total count
        // In a production system, you might want to implement a separate count query
        // or use a GSI with a different access pattern for better performance
        const totalCount = reports.length;
        const totalPages = Math.ceil(totalCount / pageSize);

        return {
          reports,
          totalCount,
          currentPage,
          pageSize,
          totalPages,
        };
      } catch (error) {
        // Log error for debugging purposes
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(
          `Failed to retrieve reports from database: ${errorMessage}`,
        );
      }
    },

    async findSummariesByType(params: {
      type: string;
      currentPage: number;
      pageSize: number;
    }): Promise<{
      reports: ReportSummary[];
      totalCount: number;
      currentPage: number;
      pageSize: number;
      totalPages: number;
    }> {
      const { type, currentPage, pageSize } = params;

      if (type !== "overall") {
        throw new Error(`Unsupported report type: ${type}`);
      }

      const pk = `REPORT#OVERALL`;
      const limit = pageSize;

      try {
        const queryCommand = new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: {
            ":pk": pk,
          },
          ProjectionExpression: "reportId, asOfDate, title, createdAt",
          ScanIndexForward: false,
          Limit: limit,
        });

        const result = await doc.send(queryCommand);

        const reports: ReportSummary[] = (result.Items || []).map(
          (item: any) => ({
            reportId: item.reportId,
            asOfDate: item.asOfDate,
            title: item.title,
            createdAt: item.createdAt,
          }),
        );

        const totalCount = reports.length;
        const totalPages = Math.ceil(totalCount / pageSize);

        return {
          reports,
          totalCount,
          currentPage,
          pageSize,
          totalPages,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(
          `Failed to retrieve report summaries from database: ${errorMessage}`,
        );
      }
    },
  };
}
