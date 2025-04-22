/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "kairos-be",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const myFunction = new sst.aws.Function("MyFunction", {
      url: true,
      runtime: "python3.11",
      handler: "functions/handler.main",
    });

    return {
      FunctionUrl: myFunction.url,
    };
  },
});
