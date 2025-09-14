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

    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "bySymbol",
      KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": gsi1pk,
        ":from": `DATE#${fromDate}`,
        ":to": `DATE#${toDate}`,
      },
      Limit: limit,
      ScanIndexForward: true,
    });
    const out = await this.doc.send(cmd);
    const items = out.Items ?? [];
    return items.map(this.mapToPoint);
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
    if (gsi1sk && gsi1sk.startsWith("DATE#"))
      return gsi1sk.slice("DATE#".length);
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
