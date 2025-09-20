/**
 * Business logic: fetch a company profile/item by stock code.
 */
import { CompanyRepository, CompanyItem } from "./db/company_repository";
import { getLogger } from "@src/util/logger";

export interface GetCompanyInput {
  code: string;
  companyTableName: string;
}

export interface GetCompanyOutput {
  code: string;
  company: CompanyItem | null;
}

export async function getCompany(
  input: GetCompanyInput
): Promise<GetCompanyOutput> {
  const logger = getLogger("market/get_company");
  const code = normalizeCode(input.code);
  const repo = new CompanyRepository({ tableName: input.companyTableName });
  const company = await repo.getByCode({ code });
  logger.debug({ code, found: company != null }, "company business result");
  return { code, company };
}

function normalizeCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase();
}
