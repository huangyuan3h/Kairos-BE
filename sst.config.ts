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
    // Dynamically import the infrastructure configuration
    const { createInfrastructure } = await import("./deploy");

    const isProduction = $app.stage === "prod";

    // Create all infrastructure resources using modular configuration
    const infrastructure = await createInfrastructure({
      isProduction,
      stage: $app.stage,
    });

    // Export resources for potential use in other parts of the application
    return {
      infrastructure,
    };
  },
});
