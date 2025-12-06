/**
 * MarketData repository (Node.js) for catalog queries.
 *
 * This file encapsulates DynamoDB access for fuzzy catalog search so that
 * Lambda handlers remain thin and business logic stays testable.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_MAX_QUERY_PAGES = 10;
const MAX_QUERY_PAGES = 20;
const DEFAULT_STATUS = "active";
const PROJECTION =
  "pk, gsi1pk, symbol, #name, exchange, asset_type, market, #status";
const ATTRIBUTE_NAMES = {
  "#name": "name",
  "#symbol": "symbol",
  "#status": "status",
  "#asset_type": "asset_type",
};

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
   * Query catalog entries directly by canonical symbol via bySymbol GSI.
   */
  async queryCatalogBySymbolExact(params: {
    symbol: string;
    limit: number;
  }): Promise<CatalogItem[]> {
    const symbol = String(params.symbol ?? "")
      .trim()
      .toUpperCase();
    if (!symbol) return [];
    const target = this.clampLimit(params.limit);
    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "bySymbol",
      KeyConditionExpression: "gsi1pk = :pk AND begins_with(gsi1sk, :entity)",
      ExpressionAttributeValues: {
        ":pk": `SYMBOL#${symbol}`,
        ":entity": "ENTITY#CATALOG",
      },
      ExpressionAttributeNames: ATTRIBUTE_NAMES,
      ProjectionExpression: PROJECTION,
      Limit: target,
    });
    const out = await this.doc.send(cmd);
    const items = (out.Items ?? []).map(it =>
      this.normalize(this.ensureSymbol(it))
    );
    return items as unknown as CatalogItem[];
  }

  /**
   * Query the GSI2 by market/status for catalog entries with fuzzy filter on name/symbol.
   */
  async queryCatalogByMarketFuzzy(params: {
    market: string;
    q: string;
    limit: number;
    maxPages?: number;
    status?: string;
  }): Promise<CatalogItem[]> {
    const { market, q } = params;
    const target = this.clampLimit(params.limit);
    const gsi2pk = this.buildMarketStatusPk(market, params.status);
    const maxPages = this.clampPages(params.maxPages);
    const baseInput = {
      TableName: this.table,
      IndexName: "byMarketStatus",
      KeyConditionExpression: "gsi2pk = :pk AND begins_with(gsi2sk, :entity)",
      ExpressionAttributeValues: {
        ":pk": gsi2pk,
        ":entity": "ENTITY#CATALOG",
        ":q": q,
        ":qu": q.toUpperCase(),
        ":ql": q.toLowerCase(),
      },
      ExpressionAttributeNames: ATTRIBUTE_NAMES,
      // Some items may not materialize 'symbol'; include pk/gsi1pk for fuzzy code match
      FilterExpression:
        "contains(#name, :q) OR contains(#name, :qu) OR contains(#name, :ql) OR " +
        "contains(#symbol, :q) OR contains(#symbol, :qu) OR contains(#symbol, :ql) OR " +
        "contains(pk, :q) OR contains(pk, :qu) OR contains(pk, :ql) OR " +
        "contains(gsi1pk, :q) OR contains(gsi1pk, :qu) OR contains(gsi1pk, :ql)",
      ProjectionExpression: PROJECTION,
    };

    const collected: CatalogItem[] = [];
    let cursor: Record<string, unknown> | undefined;
    let pages = 0;

    while (collected.length < target && pages < maxPages) {
      const remaining = target - collected.length;
      const cmd = new QueryCommand({
        ...baseInput,
        Limit: Math.max(remaining, MIN_LIMIT),
        ExclusiveStartKey: cursor,
      });
      const out = await this.doc.send(cmd);
      const items = (out.Items ?? []).map(it =>
        this.normalize(this.ensureSymbol(it))
      );
      collected.push(...(items as unknown as CatalogItem[]));
      cursor = out.LastEvaluatedKey as Record<string, unknown> | undefined;
      pages += 1;
      if (!cursor) break;
    }

    return collected.slice(0, target);
  }

  async queryCatalogPage(params: {
    market: string;
    limit: number;
    cursor?: Record<string, unknown>;
    assetType?: string;
    q?: string;
    status?: string;
  }): Promise<{ items: CatalogItem[]; cursor?: Record<string, unknown> }> {
    const target = this.clampLimit(params.limit);
    const gsi2pk = this.buildMarketStatusPk(params.market, params.status);
    const filterParts: string[] = [];
    const values: Record<string, unknown> = {
      ":pk": gsi2pk,
      ":entity": "ENTITY#CATALOG",
    };
    const names: Record<string, string> = {
      "#name": "name",
      "#status": "status",
    };

    if (params.q) {
      names["#symbol"] = "symbol";
      values[":q"] = params.q;
      values[":qu"] = params.q.toUpperCase();
      values[":ql"] = params.q.toLowerCase();
      filterParts.push(
        "contains(#name, :q) OR contains(#name, :qu) OR contains(#name, :ql) OR " +
          "contains(#symbol, :q) OR contains(#symbol, :qu) OR contains(#symbol, :ql) OR " +
          "contains(pk, :q) OR contains(pk, :qu) OR contains(pk, :ql) OR " +
          "contains(gsi1pk, :q) OR contains(gsi1pk, :qu) OR contains(gsi1pk, :ql)"
      );
    }

    if (params.assetType) {
      names["#asset_type"] = "asset_type";
      values[":assetType"] = params.assetType;
      filterParts.push("#asset_type = :assetType");
    }

    const cmd = new QueryCommand({
      TableName: this.table,
      IndexName: "byMarketStatus",
      KeyConditionExpression: "gsi2pk = :pk AND begins_with(gsi2sk, :entity)",
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      FilterExpression:
        filterParts.length > 0 ? filterParts.join(" AND ") : undefined,
      ProjectionExpression: PROJECTION,
      Limit: target,
      ExclusiveStartKey: params.cursor,
    });

    const out = await this.doc.send(cmd);
    const items = (out.Items ?? []).map(it =>
      this.normalize(this.ensureSymbol(it))
    );
    return {
      items: items as unknown as CatalogItem[],
      cursor: out.LastEvaluatedKey as Record<string, unknown> | undefined,
    };
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

  private clampLimit(value: number): number {
    if (!Number.isFinite(value)) return MIN_LIMIT;
    return Math.min(Math.max(Math.trunc(value), MIN_LIMIT), MAX_LIMIT);
  }

  private clampPages(value?: number): number {
    if (!Number.isFinite(value ?? NaN)) return DEFAULT_MAX_QUERY_PAGES;
    return Math.min(Math.max(Math.trunc(value as number), 1), MAX_QUERY_PAGES);
  }

  private buildMarketStatusPk(market: string, status?: string): string {
    const normalizedStatus =
      (status ?? DEFAULT_STATUS)?.toLowerCase() || DEFAULT_STATUS;
    return `MARKET#${market}#STATUS#${normalizedStatus}`;
  }

  /**
   * Normalize catalog item fields for API consumers.
   * - asset_type: collapse "etf" into "index" to keep a two-type taxonomy.
   */
  private normalize(item: Record<string, unknown>): Record<string, unknown> {
    const v = item?.["asset_type"] as string | undefined;
    if (typeof v === "string" && v.toLowerCase() === "etf") {
      return { ...item, asset_type: "index" };
    }
    return item;
  }
}
