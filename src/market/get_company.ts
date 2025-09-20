/**
 * Business logic: fetch a company profile/item by stock code.
 */
import { CompanyRepository, CompanyItem } from "./db/company_repository";
import { getLogger } from "@src/util/logger";

export interface GetCompanyInput {
  code: string;
  companyTableName: string;
}

export async function getCompany(
  input: GetCompanyInput
): Promise<CompanyItem | null> {
  const logger = getLogger("market/get_company");
  const code = normalizeCode(input.code);
  const repo = new CompanyRepository({ tableName: input.companyTableName });
  const company = await repo.getByCode({ code });
  logger.debug({ code, found: company != null }, "company business result");
  return company;
}

function normalizeCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase();
}
