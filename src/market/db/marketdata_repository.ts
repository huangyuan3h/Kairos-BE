/**
 * MarketData repository (Node.js) for catalog queries.
 *
 * This file encapsulates DynamoDB access for fuzzy catalog search so that
 * Lambda handlers remain thin and business logic stays testable.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

export interface CatalogItem {
  symbol: string;
  name: string;
  exchange?: string;
  asset_type?: string;
  market?: string;
  status?: string;
}

export interface MarketDataRepositoryOptions {
  tableName: string;
  client?: DynamoDBDocumentClient;
}

export class MarketDataRepository {
  private readonly table: string;
  private readonly doc: DynamoDBDocumentClient;

  constructor(options: MarketDataRepositoryOptions) {
    this.table = options.tableName;
    this.doc =
      options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  /**
   * Query the GSI2 by market/status for catalog entries with fuzzy filter on name/symbol.
   */
  async queryCatalogByMarketFuzzy(params: {
    market: string;
    q: string;
    limit: number;
  }): Promise<CatalogItem[]> {
    const { market, q, limit } = params;
    const gsi2pk = `MARKET#${market}#STATUS#ACTIVE`;
    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "byMarketStatus",
      KeyConditionExpression: "gsi2pk = :pk AND begins_with(gsi2sk, :entity)",
      ExpressionAttributeValues: {
        ":pk": gsi2pk,
        ":entity": "ENTITY#CATALOG",
        ":q": q,
      },
      ExpressionAttributeNames: { "#name": "name", "#symbol": "symbol" },
      FilterExpression: "contains(#name, :q) OR contains(#symbol, :q)",
      ProjectionExpression:
        "symbol, #name, exchange, asset_type, market, status",
      Limit: limit,
    });
    const out = await this.doc.send(cmd);
    return (out.Items ?? []) as CatalogItem[];
  }

  /**
   * Fallback small Scan over META#CATALOG items with fuzzy filter.
   */
  async scanCatalogFuzzy(params: {
    q: string;
    limit: number;
  }): Promise<CatalogItem[]> {
    const { q, limit } = params;
    const cmd = new ScanCommand({
      TableName: this.table,
      FilterExpression:
        "begins_with(sk, :sk) AND (contains(#name, :q) OR contains(#symbol, :q))",
      ExpressionAttributeValues: { ":sk": "META#CATALOG", ":q": q },
      ExpressionAttributeNames: { "#name": "name", "#symbol": "symbol" },
      ProjectionExpression:
        "symbol, #name, exchange, asset_type, market, status",
      Limit: limit,
    });
    const out = await this.doc.send(cmd);
    return (out.Items ?? []) as CatalogItem[];
  }
}
