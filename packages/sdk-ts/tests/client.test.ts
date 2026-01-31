import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentOps } from "../src/client";
import { Session } from "../src/session";

// Mock fetch globally to avoid network calls
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  } as Response),
);

describe("AgentOps", () => {
  let agentops: AgentOps;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockClear();

    agentops = new AgentOps({
      apiKey: "ao_test_key",
      disabled: false,
      flushInterval: 50, // Short interval for tests
    });
  });

  afterEach(async () => {
    await agentops.shutdown();
    vi.unstubAllGlobals();
  });

  describe("initialization", () => {
    it("should create client with config", () => {
      expect(agentops).toBeInstanceOf(AgentOps);
    });

    it("should use environment variable for API key", async () => {
      process.env.AGENTOPS_API_KEY = "ao_env_key";
      const client = new AgentOps({ flushInterval: 50 });
      expect(client).toBeInstanceOf(AgentOps);
      await client.shutdown();
      delete process.env.AGENTOPS_API_KEY;
    });

    it("should throw without API key", () => {
      delete process.env.AGENTOPS_API_KEY;
      expect(() => new AgentOps({})).toThrow();
    });
  });

  describe("sessions", () => {
    it("should start a session", () => {
      const session = agentops.startSession({
        userId: "user_123",
        featureId: "test",
      });

      expect(session).toBeInstanceOf(Session);
      expect(session.userId).toBe("user_123");
      expect(session.featureId).toBe("test");
    });

    it("should generate session ID if not provided", () => {
      const session = agentops.startSession({});
      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).toMatch(/^sess_[A-Za-z0-9_-]+$/);
    });

    it("should track session metadata", () => {
      const session = agentops.startSession({
        userId: "user_123",
        featureId: "chat",
        tags: ["production", "v2"],
        metadata: { version: "1.0.0" },
      });

      expect(session.tags).toEqual(["production", "v2"]);
      expect(session.metadata).toEqual({ version: "1.0.0" });
    });
  });

  describe("event tracking", () => {
    it("should track prompts", () => {
      const session = agentops.startSession({});

      session.trackPrompt("Hello, world!", {
        model: "gpt-4o",
        role: "user",
      });

      expect(session.stats.eventCount).toBe(1);
    });

    it("should track responses with tokens", () => {
      const session = agentops.startSession({});

      session.trackResponse("Hi there!", {
        model: "gpt-4o",
        tokens: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        durationMs: 500,
      });

      expect(session.stats.eventCount).toBe(1);
      expect(session.stats.promptTokens).toBe(10);
      expect(session.stats.completionTokens).toBe(5);
    });

    it("should track tool calls", () => {
      const session = agentops.startSession({});

      const eventId = session.trackToolCall("web_search", {
        query: "latest news",
      });

      expect(eventId).toBeDefined();
      expect(session.stats.eventCount).toBe(1);
    });

    it("should track tool results", () => {
      const session = agentops.startSession({});

      const callId = session.trackToolCall("web_search", { query: "test" });
      session.trackToolResult(
        "web_search",
        { results: [] },
        {
          status: "success",
          durationMs: 1000,
          parentEventId: callId,
        },
      );

      expect(session.stats.eventCount).toBe(2);
    });

    it("should track errors", () => {
      const session = agentops.startSession({});

      session.trackError(new Error("Test error"));

      expect(session.stats.eventCount).toBe(1);
    });

    it("should track custom events", () => {
      const session = agentops.startSession({});

      session.trackCustom("user_feedback", {
        rating: 5,
        comment: "Great!",
      });

      expect(session.stats.eventCount).toBe(1);
    });
  });

  describe("session stats", () => {
    it("should calculate total cost", () => {
      const session = agentops.startSession({});

      session.trackResponse("Response 1", {
        model: "gpt-4o",
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      session.trackResponse("Response 2", {
        model: "gpt-4o",
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      expect(session.stats.totalCost).toBeGreaterThan(0);
    });

    it("should track models used", () => {
      const session = agentops.startSession({});

      session.trackResponse("R1", {
        model: "gpt-4o",
        tokens: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      });
      session.trackResponse("R2", {
        model: "claude-3-5-sonnet",
        tokens: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      });

      expect(session.stats.models).toContain("gpt-4o");
      expect(session.stats.models).toContain("claude-3-5-sonnet");
    });

    it("should track tools used", () => {
      const session = agentops.startSession({});

      session.trackToolCall("web_search", {});
      session.trackToolCall("calculator", {});

      expect(session.stats.tools).toContain("web_search");
      expect(session.stats.tools).toContain("calculator");
    });
  });

  describe("disabled mode", () => {
    it("should not track when disabled", async () => {
      const disabledClient = new AgentOps({
        apiKey: "ao_test",
        disabled: true,
        flushInterval: 50,
      });

      const session = disabledClient.startSession({});
      session.trackPrompt("test");

      // Should not throw, but also shouldn't track
      expect(session).toBeInstanceOf(Session);
      await disabledClient.shutdown();
    });
  });
});

describe("Session", () => {
  it("should end session with status", () => {
    const trackFn = vi.fn();
    const session = new Session("test", trackFn);

    session.end({ status: "completed" });

    expect(session.status).toBe("completed");
    expect(session.endedAt).toBeDefined();
  });

  it("should end session with error status", () => {
    const trackFn = vi.fn();
    const session = new Session("test", trackFn);

    session.end({ status: "error", errorMessage: "Something went wrong" });

    expect(session.status).toBe("error");
  });

  it("should calculate duration", () => {
    const trackFn = vi.fn();
    const session = new Session("test", trackFn);

    // Simulate some time passing
    session.end({ status: "completed" });

    expect(session.stats.durationMs).toBeGreaterThanOrEqual(0);
  });
});
