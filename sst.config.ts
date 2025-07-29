import { SSTConfig } from "sst";
import { Cron, Table } from "sst/constructs";
import * as yaml from "js-yaml";
import * as fs from "fs";

// Define the structure of a job in the YAML file
interface SyncJob {
  name: string;
  description: string;
  schedule: string;
  handler: string;
  parameters: Record<string, string>;
}

export default {
  config(_input) {
    return {
      name: "kairos-be",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function Stack({ stack }) {
      // DynamoDB table to store the master list of all securities (stocks, funds, etc.)
      const securitiesTable = new Table(stack, "Securities", {
        fields: {
          market: "string",    // e.g., "CN_A", "US", "FUND"
          symbol: "string",    // e.g., "600519.SH", "AAPL"
          type: "string",      // e.g., "STOCK", "ETF"
        },
        primaryIndex: { partitionKey: "market", sortKey: "symbol" },
        globalIndexes: {
          "TypeIndex": { partitionKey: "type", sortKey: "symbol" },
        },
      });

      // Load and parse the sync configuration file
      const config = yaml.load(fs.readFileSync("sync_config.yml", "utf8")) as { jobs: SyncJob[] };

      // Dynamically create Cron jobs based on the configuration
      for (const job of config.jobs) {
        const cron = new Cron(stack, job.name, {
          schedule: job.schedule,
          job: {
            function: {
              handler: job.handler,
              // Pass job-specific parameters as environment variables to the Lambda
              environment: job.parameters,
            },
          },
        });
        // Grant each job's function access to the securities table
        cron.bind([securitiesTable]);
      }

    });
  },
} satisfies SSTConfig;
