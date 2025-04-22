/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "kairos-be",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: true,
      },
    };
  },
  async run() {
    const myFunction = new sst.aws.Function("MyFunction", {
      url: true,
      runtime: "python3.11",
      handler: "functions/src/functions/handler.main",
    });

    return {
      FunctionUrl: myFunction.url,
    };
  },
});
