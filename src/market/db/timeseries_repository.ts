/**
 * Generic DynamoDB time series repository using GSI1 by symbol and date.
 *
 * Assumptions:
 * - GSI1: { hashKey: gsi1pk = "SYMBOL#<code>", rangeKey: gsi1sk = "DATE#<YYYY-MM-DD>" }
 * - Items may store a dedicated date attribute (e.g., "date" or "as_of_date").
 *   If absent, we derive it from gsi1sk/sk with prefix "DATE#".
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getLogger } from "@src/util/logger";

export interface TimeseriesPoint {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  [key: string]: unknown;
}

export interface TimeseriesRepositoryOptions {
  tableName: string;
  client?: DynamoDBDocumentClient;
}

export class TimeseriesRepository {
  private readonly table: string;
  private readonly doc: DynamoDBDocumentClient;
  private readonly logger = getLogger("market/timeseries_repository");

  constructor(options: TimeseriesRepositoryOptions) {
    this.table = options.tableName;
    this.doc =
      options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  /**
   * Query time series points for a symbol between fromDate and toDate (inclusive).
   */
  async queryBySymbolDateRange(params: {
    code: string;
    fromDate: string;
    toDate: string;
    limit?: number;
  }): Promise<TimeseriesPoint[]> {
    const { code, fromDate, toDate, limit } = params;
    const gsi1pk = `SYMBOL#${code}`;
    const fromSk = this.buildGsi1Sk(fromDate);
    const toSk = this.buildGsi1Sk(toDate);

    // Compute a safe upper bound for items when caller didn't provide one.
    // Using date range window size as a hint avoids over-fetching.
    const inferredLimit = this.inferWindowLimit(fromDate, toDate);
    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "bySymbol",
      KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": gsi1pk,
        ":from": fromSk,
        ":to": toSk,
      },
      // Use ExpressionAttributeNames to avoid reserved keyword conflicts (e.g., "date", "open", "close")
      ExpressionAttributeNames: {
        "#date": "date",
        "#as_of_date": "as_of_date",
        "#open": "open",
        "#high": "high",
        "#low": "low",
        "#close": "close",
        "#adj_close": "adj_close",
        "#volume": "volume",
      },
      ProjectionExpression:
        "gsi1sk, #date, #as_of_date, #open, #high, #low, #close, #adj_close, #volume",
      Limit: limit ?? inferredLimit,
      ScanIndexForward: true,
    });
    const out = await this.doc.send(cmd);
    const items = out.Items ?? [];
    const points = items.map(this.mapToPoint);
    this.logger.debug(
      { table: this.table, code, fromDate, toDate, count: points.length },
      "timeseries query result"
    );
    return points;
  }

  private buildGsi1Sk(date: string): string {
    // Align with Python writer: gsi1sk = "ENTITY#QUOTE#YYYY-MM-DD"
    return `ENTITY#QUOTE#${date}`;
  }

  /**
   * Query latest N points for a symbol (descending by date).
   */
  async queryLatestBySymbol(params: {
    code: string;
    limit?: number;
  }): Promise<TimeseriesPoint[]> {
    const { code, limit } = params;
    const gsi1pk = `SYMBOL#${code}`;
    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "bySymbol",
      KeyConditionExpression: "gsi1pk = :pk AND begins_with(gsi1sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": gsi1pk,
        ":prefix": "ENTITY#QUOTE",
      },
      // Avoid reserved attribute name conflicts
      ExpressionAttributeNames: {
        "#date": "date",
        "#as_of_date": "as_of_date",
        "#open": "open",
        "#high": "high",
        "#low": "low",
        "#close": "close",
        "#adj_close": "adj_close",
        "#volume": "volume",
      },
      ProjectionExpression:
        "gsi1sk, #date, #as_of_date, #open, #high, #low, #close, #adj_close, #volume",
      Limit: limit ?? 1,
      ScanIndexForward: false,
    });
    const out = await this.doc.send(cmd);
    const items = out.Items ?? [];
    const points = items.map(this.mapToPoint);
    this.logger.debug(
      { table: this.table, code, latestCount: points.length },
      "timeseries latest query result"
    );
    return points;
  }

  private inferWindowLimit(from: string, to: string): number {
    try {
      const f = new Date(from + "T00:00:00Z");
      const t = new Date(to + "T00:00:00Z");
      const days = Math.max(
        1,
        Math.floor((t.getTime() - f.getTime()) / (24 * 3600 * 1000)) + 1
      );
      // Add small buffer for data anomalies while keeping a tight cap
      return Math.min(days + 5, days * 2);
    } catch {
      return undefined as unknown as number; // Let SDK ignore undefined
    }
  }

  private mapToPoint = (item: Record<string, unknown>): TimeseriesPoint => {
    const date = this.extractDate(item);
    return {
      date,
      open: this.num(item["open"]),
      high: this.num(item["high"]),
      low: this.num(item["low"]),
      close: this.num(item["close"] ?? item["adj_close"]),
      volume: this.num(item["volume"]),
      ...item,
    } as TimeseriesPoint;
  };

  private extractDate(item: Record<string, unknown>): string {
    const direct = (item["date"] || item["as_of_date"]) as string | undefined;
    if (direct && /^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const gsi1sk = item["gsi1sk"] as string | undefined;
    if (gsi1sk) {
      // Support both legacy format "DATE#YYYY-MM-DD" and current "ENTITY#QUOTE#YYYY-MM-DD"
      if (gsi1sk.startsWith("DATE#")) return gsi1sk.slice("DATE#".length);
      const entityQuotePrefix = "ENTITY#QUOTE#";
      if (gsi1sk.startsWith(entityQuotePrefix))
        return gsi1sk.slice(
          entityQuotePrefix.length,
          entityQuotePrefix.length + 10
        );
    }
    const sk = item["sk"] as string | undefined;
    if (sk && sk.includes("DATE#"))
      return sk.split("DATE#").pop()!.slice(0, 10);
    return "";
  }

  private num(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }
}
