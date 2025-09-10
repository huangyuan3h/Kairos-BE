// Load envs from .env
// bun run src/reporting/script/debug_overall_report.ts
import "dotenv/config";
import { generateOverallReport } from "../business/generate_overall_report";

async function main() {
  const report = await generateOverallReport();
  // Print structured result for inspection
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
