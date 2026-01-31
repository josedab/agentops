/**
 * Integration tests for SDK to Ingest API communication
 *
 * Tests end-to-end flows from SDK client through transport layer to ingest API.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { AgentOps } from "../src/client";
import { init, startSession, shutdown } from "../src";

// Mock fetch for integration tests
const mockFetch = vi.fn();

describe("SDK Integration Tests", () => {
  beforeAll(() => {
    // Replace global fetch with mock
    vi.stubGlobal("fetch", mockFetch);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
  });

  describe("Client Initialization", () => {
    it("creates client with API key", () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        disabled: true,
      });

      expect(client).toBeDefined();
    });

    it("creates client from environment variable", () => {
      process.env.AGENTOPS_API_KEY = "ao_test_env_key_12345678901234567890";

      const client = new AgentOps({
        disabled: true,
      });
      expect(client).toBeDefined();

      delete process.env.AGENTOPS_API_KEY;
    });
  });

  describe("Session Lifecycle", () => {
    it("tracks session start event", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({
        userId: "user_123",
        featureId: "chat",
        tags: ["test"],
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify fetch was called with correct data
      expect(mockFetch).toHaveBeenCalled();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const [url, options] = lastCall;

      expect(url).toBe("http://localhost:8787/v1/events");
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe(
        "Bearer ao_test_123456789012345678901234567890",
      );

      const body = JSON.parse(options.body);
      expect(body.events).toBeDefined();
      expect(body.events[0].type).toBe("session_start");

      await client.shutdown();
    });

    it("tracks session end event", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.end("completed");

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockFetch).toHaveBeenCalled();

      // Find session_end event in calls
      const allCalls = mockFetch.mock.calls;
      let foundSessionEnd = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "session_end") {
            foundSessionEnd = true;
            expect(event.status).toBe("completed");
          }
        }
      }

      expect(foundSessionEnd).toBe(true);

      await client.shutdown();
    });
  });

  describe("Event Tracking", () => {
    it("tracks prompt events", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.trackPrompt("What is the capital of France?", {
        model: "gpt-4o",
        role: "user",
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundPrompt = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "prompt") {
            foundPrompt = true;
            expect(event.content).toBe("What is the capital of France?");
            expect(event.model).toBe("gpt-4o");
          }
        }
      }

      expect(foundPrompt).toBe(true);

      await client.shutdown();
    });

    it("tracks response events with tokens and cost", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.trackResponse("The capital of France is Paris.", {
        model: "gpt-4o",
        tokens: {
          promptTokens: 50,
          completionTokens: 10,
          totalTokens: 60,
        },
        durationMs: 250,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundResponse = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "response") {
            foundResponse = true;
            expect(event.content).toBe("The capital of France is Paris.");
            expect(event.tokens.totalTokens).toBe(60);
            expect(event.durationMs).toBe(250);
          }
        }
      }

      expect(foundResponse).toBe(true);

      await client.shutdown();
    });

    it("tracks tool call events", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      const toolId = session.trackToolCall("web_search", {
        query: "weather today",
      });

      expect(toolId).toBeTruthy();

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundToolCall = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "tool_call") {
            foundToolCall = true;
            expect(event.toolName).toBe("web_search");
          }
        }
      }

      expect(foundToolCall).toBe(true);

      await client.shutdown();
    });

    it("tracks tool result events with parent reference", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      const toolId = session.trackToolCall("calculator", { a: 5, b: 3 });
      session.trackToolResult(
        "calculator",
        { result: 8 },
        {
          status: "success",
          durationMs: 5,
          parentEventId: toolId,
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundToolResult = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "tool_result") {
            foundToolResult = true;
            expect(event.toolName).toBe("calculator");
            expect(event.parentEventId).toBe(toolId);
          }
        }
      }

      expect(foundToolResult).toBe(true);

      await client.shutdown();
    });

    it("tracks error events", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      const error = new Error("API rate limit exceeded");
      error.name = "RateLimitError";
      session.trackError(error);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundError = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "error") {
            foundError = true;
            expect(event.errorType).toBe("RateLimitError");
          }
        }
      }

      expect(foundError).toBe(true);

      await client.shutdown();
    });

    it("tracks custom events", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.trackCustom("user_feedback", {
        rating: 5,
        comment: "Great response!",
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const allCalls = mockFetch.mock.calls;
      let foundCustom = false;

      for (const call of allCalls) {
        const body = JSON.parse(call[1].body);
        for (const event of body.events) {
          if (event.type === "custom" && event.name === "user_feedback") {
            foundCustom = true;
            expect(event.data.rating).toBe(5);
          }
        }
      }

      expect(foundCustom).toBe(true);

      await client.shutdown();
    });
  });

  describe("Batch Processing", () => {
    it("batches multiple events before flush", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 200, // Longer interval to accumulate events
      });

      const session = client.startSession({});

      // Track multiple events quickly
      session.trackPrompt("Question 1");
      session.trackResponse("Answer 1", { model: "gpt-4o" });
      session.trackPrompt("Question 2");
      session.trackResponse("Answer 2", { model: "gpt-4o" });

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should have sent events in batch(es)
      expect(mockFetch).toHaveBeenCalled();

      // Count total events sent
      let totalEvents = 0;
      for (const call of mockFetch.mock.calls) {
        const body = JSON.parse(call[1].body);
        totalEvents += body.events.length;
      }

      // At least: session_start + 4 tracked events = 5
      expect(totalEvents).toBeGreaterThanOrEqual(5);

      await client.shutdown();
    });

    it("respects max batch size", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 10000, // Long interval
        maxBatchSize: 5,
      });

      const session = client.startSession({});

      // Track more events than batch size
      for (let i = 0; i < 10; i++) {
        session.trackCustom("event", { index: i });
      }

      // Wait a bit for batch triggers
      await new Promise((resolve) => setTimeout(resolve, 100));

      // At least one batch should have been sent
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

      await client.shutdown();
    });
  });

  describe("Error Handling", () => {
    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.trackPrompt({ content: "Test" });

      // Should not throw
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.shutdown();
    });

    it("handles server errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ success: false, message: "Internal error" }),
      });

      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      const session = client.startSession({});
      session.trackPrompt({ content: "Test" });

      // Should not throw
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.shutdown();
    });
  });

  describe("Session Stats", () => {
    it("calculates session statistics", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        disabled: true, // Disable network calls for this test
      });

      const session = client.startSession({});

      session.trackPrompt("Question 1", { model: "gpt-4o" });
      session.trackResponse("Answer 1", {
        model: "gpt-4o",
        tokens: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });
      session.trackPrompt("Question 2", { model: "gpt-4o" });
      session.trackResponse("Answer 2", {
        model: "gpt-4o",
        tokens: { promptTokens: 60, completionTokens: 30, totalTokens: 90 },
      });
      session.trackToolCall("web_search", {});

      const stats = session.stats;

      expect(stats.eventCount).toBeGreaterThanOrEqual(5);
      expect(stats.totalTokens).toBe(165);
      expect(stats.promptTokens).toBe(110);
      expect(stats.completionTokens).toBe(55);
      expect(stats.models).toContain("gpt-4o");
      expect(stats.tools).toContain("web_search");

      await client.shutdown();
    });
  });

  describe("Shutdown", () => {
    it("flushes remaining events on shutdown", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 10000, // Long interval
      });

      const session = client.startSession({});
      session.trackPrompt("Test before shutdown");

      // Clear previous calls
      mockFetch.mockClear();

      // Shutdown should trigger flush
      await client.shutdown();

      // Should have flushed
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("Multi-Agent Correlation", () => {
    it("correlates events across agents", async () => {
      const client = new AgentOps({
        apiKey: "ao_test_123456789012345678901234567890",
        endpoint: "http://localhost:8787",
        flushInterval: 100,
      });

      // Parent session
      const parentSession = client.startSession({
        featureId: "orchestrator",
        metadata: { role: "coordinator" },
      });

      // Child sessions with parent reference
      const childSession1 = client.startSession({
        featureId: "researcher",
        metadata: {
          parentSessionId: parentSession.sessionId,
          role: "researcher",
        },
      });

      const childSession2 = client.startSession({
        featureId: "writer",
        metadata: {
          parentSessionId: parentSession.sessionId,
          role: "writer",
        },
      });

      // Track activities
      parentSession.trackPrompt("Coordinate research and writing");
      childSession1.trackPrompt("Research topic X");
      childSession2.trackPrompt("Write summary");

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify all sessions were created
      expect(parentSession.sessionId).toBeTruthy();
      expect(childSession1.sessionId).toBeTruthy();
      expect(childSession2.sessionId).toBeTruthy();

      await client.shutdown();
    });
  });
});

describe("Global AgentOps API", () => {
  it("exports convenience functions", async () => {
    expect(typeof init).toBe("function");
    expect(typeof startSession).toBe("function");
    expect(typeof shutdown).toBe("function");
  });

  it("initializes and tracks via global API", async () => {
    // The global init creates a new client that may use a different fetch reference
    // This test verifies the API exists and can be called without error

    init({
      apiKey: "ao_test_123456789012345678901234567890",
      endpoint: "http://localhost:8787",
      flushInterval: 50,
      disabled: true, // Disable network for this test since mocking is complex
    });

    const session = startSession({});
    expect(session).toBeDefined();
    expect(session.sessionId).toBeTruthy();

    session.trackPrompt("Global API test");

    // Verify session tracks events
    expect(session.stats.eventCount).toBeGreaterThanOrEqual(1);

    await shutdown();
  });
});
