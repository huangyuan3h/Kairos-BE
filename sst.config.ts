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

    const linkableValue = new sst.Linkable("MyLinkableValue", {
      properties: {
        foo: "Hello World",
      },
    });
    const fn = new sst.aws.Function("MyPythonFunction", {
      handler: "functions/src/functions/api.handler",
      runtime: "python3.11",
      link: [linkableValue],
      url: true,
    });

    // 添加 Cron job with Python function
    // new sst.aws.Cron("TestTaskCron", {
    //   schedule: "rate(2 minutes)",
    //   job: fn.url,
    // });
  },
});
