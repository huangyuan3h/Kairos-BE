// Load envs from .env
import "dotenv/config";
import { generateOverallReport } from "../business/generate_overall_report";

async function main() {
  const report = await generateOverallReport();
  // Print structured result for inspection
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
