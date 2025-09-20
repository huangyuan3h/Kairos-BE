/**
 * Company repository for reading company master/profile records.
 *
 * Assumptions:
 * - Primary key: pk = canonical symbol, e.g. "SH600519"
 * - No sort key; a single item per company for the profile document
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export interface CompanyItem {
  pk: string; // canonical symbol, e.g., SH600519
  name?: string;
  exchange?: string;
  market?: string;
  status?: string;
  // Financial metrics and other flattened fields may exist but are not enumerated here
  [key: string]: unknown;
}

export interface CompanyRepositoryOptions {
  tableName: string;
  client?: DynamoDBDocumentClient;
}

export class CompanyRepository {
  private readonly table: string;
  private readonly doc: DynamoDBDocumentClient;

  constructor(options: CompanyRepositoryOptions) {
    this.table = options.tableName;
    this.doc =
      options.client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  /**
   * Fetch a company record by canonical symbol (primary key).
   */
  async getByCode(params: { code: string }): Promise<CompanyItem | null> {
    const { code } = params;
    const cmd = new GetCommand({
      TableName: this.table,
      Key: { pk: code },
    });
    const out = await this.doc.send(cmd);
    return (out.Item as CompanyItem | undefined) ?? null;
  }
}
