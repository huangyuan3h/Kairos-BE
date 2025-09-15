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
  ScanCommandOutput,
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
      ExpressionAttributeNames: {
        "#name": "name",
        "#symbol": "symbol",
        "#status": "status",
      },
      // Some items may not materialize 'symbol'; include pk/gsi1pk for fuzzy code match
      FilterExpression:
        "contains(#name, :q) OR contains(#symbol, :q) OR contains(pk, :q) OR contains(gsi1pk, :q)",
      ProjectionExpression:
        "pk, gsi1pk, symbol, #name, exchange, asset_type, market, #status",
      Limit: limit,
    });
    const out = await this.doc.send(cmd);
    const items = (out.Items ?? []).map(it => this.ensureSymbol(it));
    return items as unknown as CatalogItem[];
  }

  /**
   * Fallback Scan with pagination. IMPORTANT: For Scan with FilterExpression, the Limit
   * applies to scanned items, not filtered results. We must paginate until we collect
   * enough matches or the table is exhausted to avoid false negatives.
   */
  async scanCatalogFuzzy(params: {
    q: string;
    limit: number;
  }): Promise<CatalogItem[]> {
    const { q, limit } = params;
    const collected: CatalogItem[] = [];
    let lastKey: Record<string, unknown> | undefined = undefined;
    // Page size of scanned items per request; tuned to balance cost and latency
    const pageSize = Math.max(Math.min(limit * 5, 200), 50); // 50..200

    while (collected.length < limit) {
      const cmd: ScanCommand = new ScanCommand({
        TableName: this.table,
        // Include pk/gsi1pk in fuzzy to handle items without materialized 'symbol'
        FilterExpression:
          "begins_with(sk, :sk) AND (contains(#name, :q) OR contains(#symbol, :q) OR contains(pk, :q) OR contains(gsi1pk, :q))",
        ExpressionAttributeValues: { ":sk": "META#CATALOG", ":q": q },
        ExpressionAttributeNames: {
          "#name": "name",
          "#symbol": "symbol",
          "#status": "status",
        },
        ProjectionExpression:
          "pk, gsi1pk, symbol, #name, exchange, asset_type, market, #status",
        Limit: pageSize,
        ExclusiveStartKey: lastKey as any,
      });
      const out = (await this.doc.send(cmd as any)) as ScanCommandOutput;
      const items = (out.Items ?? []).map(it => this.ensureSymbol(it));
      for (const it of items as unknown as CatalogItem[]) {
        collected.push(it);
        if (collected.length >= limit) break;
      }
      lastKey = out.LastEvaluatedKey;
      if (!lastKey) break;
    }
    return collected;
  }

  /**
   * Ensure 'symbol' exists by deriving it from keys when missing.
   */
  private ensureSymbol(item: Record<string, unknown>): Record<string, unknown> {
    if (item && typeof item === "object" && !("symbol" in item)) {
      const derived = this.deriveFromKey(
        item["gsi1pk"] as string | undefined,
        item["pk"] as string | undefined
      );
      if (derived) return { ...item, symbol: derived };
    }
    return item;
  }

  private deriveFromKey(gsi1pk?: string, pk?: string): string | undefined {
    const s = gsi1pk || pk;
    if (!s) return undefined;
    const pos = s.indexOf("#");
    return pos >= 0 && pos + 1 < s.length ? s.slice(pos + 1) : undefined;
  }
}
