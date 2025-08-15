import { DynamoTable, getDynamoTableName } from "../../util/dynamodb";
import {
  getBoolean,
  getEnvVar,
  getNumber,
  getStage,
  getString,
  isLocal,
} from "../../util/env";

describe("env utils", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  test("stage resolution with SST_STAGE", () => {
    process.env.SST_STAGE = "prod";
    expect(getStage()).toBe("prod");
  });

  test("stage fallback to NODE_ENV", () => {
    delete process.env.SST_STAGE;
    process.env.NODE_ENV = "production";
    expect(getStage()).toBe("prod");
  });

  test("isLocal detects absence of lambda env", () => {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_EXECUTION_ENV;
    expect(isLocal()).toBe(true);
  });

  test("getEnvVar returns default when missing", () => {
    const value = getEnvVar("UNKNOWN_VAR", { defaultValue: "abc" });
    expect(value).toBe("abc");
  });

  test("getEnvVar stageAware picks staged value first", () => {
    process.env.SST_STAGE = "dev";
    process.env.MY_KEY__dev = "staged";
    process.env.MY_KEY = "plain";
    const v = getEnvVar("MY_KEY");
    expect(v).toBe("staged");
  });

  test("parsers: number and boolean", () => {
    process.env.NUMBER_KEY = "42";
    process.env.BOOL_KEY = "true";
    expect(getNumber("NUMBER_KEY")).toBe(42);
    expect(getBoolean("BOOL_KEY")).toBe(true);
  });

  test("getString returns default", () => {
    expect(getString("NOPE", "x")).toBe("x");
  });

  test("dynamo table name composition with defaults", () => {
    delete process.env.SST_STAGE;
    process.env.NODE_ENV = "development";
    delete process.env.APP_NAME;
    expect(getDynamoTableName(DynamoTable.MarketData)).toBe(
      "kairos-be-dev-MarketDataTable"
    );
    expect(getDynamoTableName(DynamoTable.Reports)).toBe(
      "kairos-be-dev-ReportsTable"
    );
  });

  test("dynamo table name composition with overrides", () => {
    process.env.SST_STAGE = "prod";
    process.env.APP_NAME = "myapp";
    expect(getDynamoTableName(DynamoTable.MarketData)).toBe(
      "myapp-prod-MarketDataTable"
    );
    expect(getDynamoTableName(DynamoTable.Reports)).toBe(
      "myapp-prod-ReportsTable"
    );
  });
});
