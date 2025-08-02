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

    // Python Lambda function
    const func = new sst.aws.Function("PythonCrawler", {
      handler: "python_crawler.handler",
      runtime: "python3.11",
      code: "functions", // 指定代码目录
      url: true,
      link: [table],
      environment: {
        MARKET_DATA_TABLE: table.name,
      },
    });

    return {
      tableName: table.name,
      functionName: func.name,
      functionUrl: func.url,
    };
  },
});
