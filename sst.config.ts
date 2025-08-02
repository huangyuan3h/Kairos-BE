/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "kairos-be",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      region: "us-east-1",
    };
  },
  async run() {
    // DynamoDB table
    const table = new sst.aws.Dynamo("MarketData", {
      fields: {
        pk: "string",
        sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    });

    // 添加 Cron job with Python function
    new sst.aws.Cron("TestTaskCron", {
      schedule: "rate(2 minutes)",
      function: {
        handler: "functions.src.functions.python_crawler.handler",

        runtime: "python3.11",
        url: true,
        link: [table],
        environment: {
          MARKET_DATA_TABLE: table.name,
          PYTHONPATH: ".",
        },
      },
    });
  },
});
