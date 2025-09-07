// Load envs from .env
import "dotenv/config";
import { generateOverallReport } from "../business/generate_overall_report";

async function main() {
  const report = await generateOverallReport();
  // Print structured result for inspection
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
