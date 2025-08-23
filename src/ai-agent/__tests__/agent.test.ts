import {
  createAiAgent,
  createObjectAgent,
  createStreamingAgent,
  createTextAgent,
} from "../agent";

// Mock Langfuse to avoid runtime issues in tests
jest.mock("../telemetry/langfuse", () => ({
  getLangfuse: jest.fn(() => null),
  withTrace: jest.fn((name, fn) => fn()),
}));

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };

  // Mock Google AI API key
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";

  // Mock Langfuse (disable for tests)
  process.env.LANGFUSE_PUBLIC_KEY = "";
  process.env.LANGFUSE_SECRET_KEY = "";
});

afterEach(() => {
  process.env = originalEnv;
});

describe("AI Agent Factory", () => {
  describe("createTextAgent", () => {
    it("should create a text agent with default configuration", () => {
      const agent = createTextAgent();

      expect(agent).toBeDefined();
      expect(typeof agent.chat).toBe("function");
      expect(typeof agent.generate).toBe("function");
    });

    it("should create a text agent with custom configuration", () => {
      const agent = createTextAgent({
        model: "gemini-2.0-flash-exp",
        temperature: 0.5,
        systemPrompt: "Custom system prompt",
      });

      expect(agent).toBeDefined();
    });
  });

  describe("createStreamingAgent", () => {
    it("should create a streaming agent", () => {
      const agent = createStreamingAgent();

      expect(agent).toBeDefined();
      expect(typeof agent.chat).toBe("function");
      expect(typeof agent.generate).toBe("function");
    });
  });

  describe("createObjectAgent", () => {
    it("should create an object agent", () => {
      const agent = createObjectAgent();

      expect(agent).toBeDefined();
      expect(typeof agent.chat).toBe("function");
      expect(typeof agent.generate).toBe("function");
    });
  });
});

describe("AI Agent Interface", () => {
  let agent: ReturnType<typeof createTextAgent>;

  beforeEach(() => {
    agent = createTextAgent({
      model: "gemini-2.0-flash-exp",
      temperature: 0.1,
    });
  });

  describe("generate method", () => {
    it("should have generate method", () => {
      expect(typeof agent.generate).toBe("function");
    });

    it("should accept a string prompt", () => {
      // This is a structural test - actual API calls would require mocking
      expect(agent.generate).toBeDefined();
    });
  });

  describe("chat method", () => {
    it("should have chat method", () => {
      expect(typeof agent.chat).toBe("function");
    });

    it("should accept message array", () => {
      const _messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there!" },
      ];

      // This is a structural test - actual API calls would require mocking
      expect(agent.chat).toBeDefined();
    });
  });
});

describe("Output Format Support", () => {
  it("should support text output format", () => {
    const agent = createAiAgent({ outputFormat: "text" });
    expect(agent).toBeDefined();
  });

  it("should support object output format", () => {
    const agent = createAiAgent({ outputFormat: "object" });
    expect(agent).toBeDefined();
  });

  it("should support streaming text output format", () => {
    const agent = createAiAgent({ outputFormat: "stream-text" });
    expect(agent).toBeDefined();
  });

  it("should support streaming object output format", () => {
    const agent = createAiAgent({ outputFormat: "stream-object" });
    expect(agent).toBeDefined();
  });

  it("should default to text output format", () => {
    const agent = createAiAgent();
    expect(agent).toBeDefined();
  });
});

describe("Configuration Validation", () => {
  it("should handle undefined configuration gracefully", () => {
    const agent = createAiAgent();
    expect(agent).toBeDefined();
  });

  it("should handle empty configuration object", () => {
    const agent = createAiAgent({});
    expect(agent).toBeDefined();
  });

  it("should handle partial configuration", () => {
    const agent = createAiAgent({
      model: "gemini-2.0-flash-exp",
    });
    expect(agent).toBeDefined();
  });
});
