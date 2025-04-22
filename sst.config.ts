import { SSTConfig, App, StackContext } from "sst";

export default {
  config(_input: any) {
    return {
      name: "kairos-be",
      region: "us-east-1",
    };
  },
  stacks(app: App) {
    app.stack(function DefaultStack({ stack }: StackContext) {
      stack.addOutputs({});
    });
  },
} satisfies SSTConfig;
