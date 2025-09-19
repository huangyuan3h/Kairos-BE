/// <reference path="../../.sst/platform/config.d.ts" />

/**
 * Company table (reference/master data for company profile, announcements, KPI)
 *
 * Key design
 * -----------
 * pk:    "COMPANY#<symbol>"
 * sk:    namespace for profile/announcements/kpi
 *        - META#COMPANY#PROFILE#v1
 *        - META#ANNOUNCEMENT#<YYYY-MM-DD>#<source>#<id>
 *        - META#KPI#FISCAL#<YYYY>Q<1-4> | META#KPI#FY#<YYYY>
 *
 * GSI:
 *  - byDate:         gsi1pk=DATE#YYYY-MM-DD, gsi1sk=COMPANY#<symbol>#TYPE#<ANNOUNCEMENT|KPI>
 *  - byType (opt):   gsi2pk=TYPE#<ANNOUNCEMENT|KPI>, gsi2sk=DATE#YYYY-MM-DD#COMPANY#<symbol>
 *  - byFiscalPeriod: gsi3pk=PERIOD#<YYYY>Q<1-4>|FY#<YYYY>, gsi3sk=COMPANY#<symbol>
 */
export function createCompanyTable() {
  const companyTable = new sst.aws.Dynamo("Company", {
    fields: {
      pk: "string",      // company code, e.g., SH600519
      gsi1pk: "string",  // constant partition for score index
      gsi1sk: "string",  // sortable score + symbol
    },
    primaryIndex: { hashKey: "pk" },
    globalIndexes: {
      byScore: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
    },
    transform: {
      table: {
        name: `${$app.name}-${$app.stage}-CompanyTable`,
      },
    },
  });
  return companyTable;
}


