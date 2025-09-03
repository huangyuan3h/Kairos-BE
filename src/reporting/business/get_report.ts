import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
import { createDynamoReportRepository } from "../db/dynamo_report_repository";

/**
 * Business logic for getting reports with pagination.
 * Supports filtering by report type and pagination.
 */

export interface GetReportsParams {
  type: string;
  currentPage: number;
  pageSize: number;
}

export interface GetReportsResult {
  reports: Array<{
    reportId: string;
    asOfDate: string;
    title: string;
    content: string;
    createdAt: string;
  }>;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get reports with pagination support.
 * Currently supports "overall" type reports.
 *
 * @param params - Query parameters including type, currentPage, and pageSize
 * @returns Paginated list of reports
 */
export async function getReports(
  params: GetReportsParams,
): Promise<GetReportsResult> {
  const { type, currentPage, pageSize } = params;

  // Validate report type
  if (type !== "overall") {
    throw new Error(
      `Unsupported report type: ${type}. Currently only "overall" type is supported.`,
    );
  }

  // Initialize repository
  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  // Get paginated reports from repository
  const result = await repo.findByType({
    type,
    currentPage,
    pageSize,
  });

  return result;
}

export interface GetReportSummariesResult {
  reports: Array<{
    reportId: string;
    asOfDate: string;
    title: string;
    createdAt: string;
  }>;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get report summaries (without content) with pagination support.
 * Designed to be shared by REST and future GraphQL resolvers.
 */
export async function getReportSummaries(
  params: GetReportsParams,
): Promise<GetReportSummariesResult> {
  const { type, currentPage, pageSize } = params;

  if (type !== "overall") {
    throw new Error(
      `Unsupported report type: ${type}. Currently only "overall" type is supported.`,
    );
  }

  const repo = createDynamoReportRepository({
    tableName: getDynamoTableName(DynamoTable.Reports),
  });

  const result = await repo.findSummariesByType({
    type,
    currentPage,
    pageSize,
  });

  return result;
}
